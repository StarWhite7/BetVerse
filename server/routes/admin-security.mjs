import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { z } from '../lib/validation.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { verifyPassword, digest } from '../lib/security.mjs';
import { adminTabProof, hasAdminTabGrant } from '../lib/admin-tab.mjs';
import { audit } from '../domain/accounts.mjs';
import { base32, encryptSecret, decryptSecret, validStep } from '../lib/totp.mjs';
export function adminSecurityRoutes({ db, config }) {
  const router = Router();
  router.use((req, _res, next) => {
    ensure(req.user.role === 'ADMIN', 403, 'Accès administrateur requis.');
    next();
  });
  router.get('/', (req, res) =>
    res.json({
      configured: Boolean(config.adminMfaKey),
      required: Boolean(config.adminMfaRequired),
      enrolled: Boolean(
        db
          .prepare('SELECT 1 FROM admin_mfa WHERE userId=? AND secretCipher IS NOT NULL')
          .get(req.user.id),
      ),
      verified: hasAdminTabGrant(db, req),
    }),
  );
  router.use(
    rateLimit({
      windowMs: 15 * 60000,
      limit: config.test ? 1000 : 10,
      keyGenerator: (req) => req.user.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  router.post('/setup', async (req, res) => {
    const { password } = z
      .object({ password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    ensure(
      config.adminMfaKey,
      409,
      'Configurer ADMIN_MFA_KEY (64 caractères hexadécimaux) sur le serveur avant l’activation.',
    );
    const user = db.prepare('SELECT passwordHash FROM users WHERE id=?').get(req.user.id);
    ensure(await verifyPassword(password, user.passwordHash), 403, 'Mot de passe incorrect.');
    const result = transaction(db, () => {
      ensure(
        db.prepare('SELECT passwordHash FROM users WHERE id=?').get(req.user.id)?.passwordHash ===
          user.passwordHash,
        409,
        'Le compte a changé. Reconnectez-vous.',
      );
      const enrolled = db
        .prepare('SELECT secretCipher FROM admin_mfa WHERE userId=?')
        .get(req.user.id)?.secretCipher;
      ensure(
        !enrolled || hasAdminTabGrant(db, req),
        403,
        'Vérifier d’abord le second facteur existant.',
      );
      const secret = randomBytes(20),
        cipher = encryptSecret(secret, config.adminMfaKey);
      db.prepare(
        'INSERT INTO admin_mfa (userId,pendingCipher,pendingUntil) VALUES (?,?,?) ON CONFLICT(userId) DO UPDATE SET pendingCipher=excluded.pendingCipher,pendingUntil=excluded.pendingUntil',
      ).run(req.user.id, cipher, Date.now() + 15 * 60000);
      return {
        secret: base32(secret),
        issuer: 'BetVerse',
        account: req.user.email,
        expiresInSeconds: 900,
      };
    });
    res.json(result);
  });
  router.post('/verify', (req, res) => {
    const { code, setup } = z
      .object({ code: z.string().min(6).max(32), setup: z.boolean().default(false) })
      .strict()
      .parse(req.body);
    ensure(config.adminMfaKey, 409, 'La protection administrateur n’est pas configurée.');
    const recoveryCodes = [];
    const tabProof = randomBytes(32).toString('hex');
    transaction(db, () => {
      const row = db.prepare('SELECT * FROM admin_mfa WHERE userId=?').get(req.user.id);
      ensure(
        row && (setup ? row.pendingCipher && row.pendingUntil > Date.now() : row.secretCipher),
        409,
        'Configurer votre application d’authentification.',
      );
      ensure(
        !setup || !row.secretCipher || hasAdminTabGrant(db, req),
        403,
        'Vérifier d’abord le second facteur existant.',
      );
      const secret = decryptSecret(
        setup ? row.pendingCipher : row.secretCipher,
        config.adminMfaKey,
      );
      const step = validStep(secret, code, setup ? -1 : row.lastStep);
      const recoveries = JSON.parse(row.recoveryHashes);
      const recoveryIndex = setup ? -1 : recoveries.indexOf(digest(code));
      ensure(step !== null || recoveryIndex >= 0, 403, 'Code incorrect, expiré ou déjà utilisé.');
      if (setup) {
        for (let index = 0; index < 8; index++) recoveryCodes.push(randomBytes(10).toString('hex'));
        db.prepare(
          'UPDATE admin_mfa SET secretCipher=pendingCipher,pendingCipher=NULL,pendingUntil=NULL,lastStep=?,recoveryHashes=? WHERE userId=?',
        ).run(step, JSON.stringify(recoveryCodes.map(digest)), req.user.id);
        db.prepare(
          'DELETE FROM admin_tab_grants WHERE tokenHash IN (SELECT tokenHash FROM sessions WHERE userId=?)',
        ).run(req.user.id);
      } else if (recoveryIndex >= 0) {
        recoveries.splice(recoveryIndex, 1);
        db.prepare('UPDATE admin_mfa SET recoveryHashes=? WHERE userId=?').run(
          JSON.stringify(recoveries),
          req.user.id,
        );
      } else db.prepare('UPDATE admin_mfa SET lastStep=? WHERE userId=?').run(step, req.user.id);
      const previous = adminTabProof(req);
      if (previous) {
        db.prepare('DELETE FROM admin_tab_grants WHERE tokenHash=? AND proofHash=?').run(
          req.session.tokenHash,
          digest(previous),
        );
      }
      db.prepare('INSERT INTO admin_tab_grants (tokenHash,proofHash) VALUES (?,?)').run(
        req.session.tokenHash,
        digest(tabProof),
      );
      audit(db, req.user.id, setup ? 'ADMIN_MFA_ENROLLED' : 'ADMIN_MFA_VERIFIED');
    });
    res.json({
      verified: true,
      tabProof,
      expiresInSeconds: Math.max(0, Math.floor((req.session.expiresAt - Date.now()) / 1000)),
      ...(recoveryCodes.length ? { recoveryCodes } : {}),
    });
  });
  return router;
}
