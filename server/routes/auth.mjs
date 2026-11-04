import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z, username, password } from '../lib/validation.mjs';
import {
  secret,
  digest,
  hashPassword,
  verifyPassword,
  readCookie,
  cookieOptions,
} from '../lib/security.mjs';
import { AppError, ensure, transaction } from '../lib/errors.mjs';
import { createUser, publicUser, audit } from '../domain/accounts.mjs';
import { mailSender } from '../lib/mail.mjs';
export async function authRoutes({ db, config, requireUser }) {
  const router = Router();
  const dummyHash = await hashPassword(secret());
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.test ? 1000 : 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  });
  const sendMail = mailSender(config);
  const issueVerification = async (user) => {
    const token = secret();
    transaction(db, () => {
      db.prepare('DELETE FROM email_verifications WHERE userId=? OR expiresAt<?').run(
        user.id,
        Date.now(),
      );
      db.prepare('INSERT INTO email_verifications VALUES (?,?,?)').run(
        digest(token),
        user.id,
        Date.now() + 86400000,
      );
    });
    await sendMail({
      to: user.email,
      subject: 'Confirmer votre adresse BetVerse',
      text: `Confirmez votre adresse sous 24 heures : ${config.origin}/auth/verify-email?token=${token}`,
    });
  };
  const newSession = (req, res, user) => {
    const token = secret(),
      csrf = secret();
    db.prepare('DELETE FROM sessions WHERE tokenHash=? OR expiresAt<?').run(
      digest(readCookie(req, config.cookieName) || ''),
      Date.now(),
    );
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
      digest(token),
      user.id,
      csrf,
      Date.now() + config.sessionMs,
    );
    res.cookie(config.cookieName, token, cookieOptions(config));
    res.json({ user, csrfToken: csrf });
  };
  router.post('/register', limiter, async (req, res) => {
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((x) => x.toLowerCase()),
        username,
        password,
      })
      .strict()
      .parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const user = createUser(db, { ...input, passwordHash, emailVerified: !config.production });
    if (config.production) {
      try {
        await issueVerification(user);
      } catch {
        throw new AppError(
          503,
          'Compte créé, mais le courriel n’a pas pu être envoyé. Utilisez « Renvoyer la confirmation » sur la page de connexion.',
        );
      }
    }
    res.status(201).json({ ...user, requiresVerification: config.production });
  });
  router.post('/login', limiter, async (req, res) => {
    const input = z
      .object({
        identifier: z.string().trim().min(3).max(254),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(req.body);
    const user = db
      .prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE')
      .get(input.identifier, input.identifier);
    const valid = await verifyPassword(input.password, user?.passwordHash || dummyHash);
    ensure(user && valid, 401, 'Identifiants incorrects.');
    ensure(
      db.prepare('SELECT passwordHash FROM users WHERE id=?').get(user.id)?.passwordHash ===
        user.passwordHash,
      401,
      'Identifiants incorrects.',
    );
    ensure(
      user.emailVerified === 1,
      403,
      'Confirmez votre adresse de courriel avant de vous connecter.',
    );
    newSession(req, res, publicUser(db, user.id));
  });
  router.get('/me', requireUser, (req, res) => {
    res.set('X-CSRF-Token', req.session.csrf).json(publicUser(db, req.user.id));
  });
  router.post('/logout', requireUser, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(req.session.tokenHash);
    res
      .clearCookie(config.cookieName, { ...cookieOptions(config), maxAge: undefined })
      .json({ success: true });
  });
  router.post('/forgot-password', limiter, async (req, res) => {
    const { identifier } = z
      .object({ identifier: z.string().trim().min(3).max(254) })
      .strict()
      .parse(req.body);
    const user = db
      .prepare(
        'SELECT id,email FROM users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE',
      )
      .get(identifier, identifier);
    if (user) {
      const token = secret();
      transaction(db, () => {
        db.prepare('DELETE FROM password_resets WHERE userId=? OR expiresAt<?').run(
          user.id,
          Date.now(),
        );
        db.prepare('INSERT INTO password_resets VALUES (?,?,?)').run(
          digest(token),
          user.id,
          Date.now() + 30 * 60 * 1000,
        );
      });
      const link = `${config.origin}/auth/reset-password?token=${token}`;
      const mail = {
        to: user.email,
        subject: 'Réinitialiser votre mot de passe BetVerse',
        text: `Ce lien est valable 30 minutes et utilisable une seule fois : ${link}`,
      };
      try {
        await sendMail(mail);
      } catch {
        // Do not expose account existence or mail provider errors.
        console.error(JSON.stringify({ event: 'password_reset_delivery_failed', userId: user.id }));
      }
    }
    res.json({ message: 'Si ce compte existe, un lien de réinitialisation a été envoyé.' });
  });
  router.post('/reset-password', limiter, async (req, res) => {
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password })
      .strict()
      .parse(req.body);
    const passwordHash = await hashPassword(input.password);
    transaction(db, () => {
      const reset = db
        .prepare('SELECT * FROM password_resets WHERE tokenHash=? AND expiresAt>?')
        .get(digest(input.token), Date.now());
      ensure(reset, 400, 'Lien invalide ou expiré.');
      db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(passwordHash, reset.userId);
      db.prepare('DELETE FROM password_resets WHERE userId=?').run(reset.userId);
      db.prepare('DELETE FROM sessions WHERE userId=?').run(reset.userId);
      audit(db, reset.userId, 'PASSWORD_RESET');
    });
    res.json({ message: 'Mot de passe mis à jour. Reconnectez-vous.' });
  });
  router.post('/resend-verification', limiter, async (req, res) => {
    const { identifier } = z
      .object({ identifier: z.string().trim().min(3).max(254) })
      .strict()
      .parse(req.body);
    const user = db
      .prepare(
        'SELECT id,email FROM users WHERE (email=? COLLATE NOCASE OR username=? COLLATE NOCASE) AND emailVerified=0',
      )
      .get(identifier, identifier);
    if (user) {
      try {
        await issueVerification(user);
      } catch {
        console.error(JSON.stringify({ event: 'verification_delivery_failed', userId: user.id }));
      }
    }
    res.json({ message: 'Si ce compte attend une confirmation, un nouveau lien a été envoyé.' });
  });
  router.post('/verify-email', limiter, (req, res) => {
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(req.body);
    transaction(db, () => {
      const record = db
        .prepare('SELECT * FROM email_verifications WHERE tokenHash=? AND expiresAt>?')
        .get(digest(token), Date.now());
      ensure(record, 400, 'Lien invalide ou expiré. Demandez une nouvelle confirmation.');
      db.prepare('UPDATE users SET emailVerified=1 WHERE id=?').run(record.userId);
      db.prepare('DELETE FROM email_verifications WHERE userId=?').run(record.userId);
      audit(db, record.userId, 'EMAIL_VERIFIED');
    });
    res.json({ message: 'Adresse confirmée. Vous pouvez vous connecter.' });
  });
  return router;
}
