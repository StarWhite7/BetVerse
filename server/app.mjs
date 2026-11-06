import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { AppError, ensure } from './lib/errors.mjs';
import { readCookie, digest } from './lib/security.mjs';
import { publicUser } from './domain/accounts.mjs';
import { authRoutes } from './routes/auth.mjs';
import { walletRoutes } from './routes/wallet.mjs';
import { matchRoutes, betRoutes } from './routes/matches.mjs';
import { userRoutes, leaderboardRoutes } from './routes/users.mjs';
import { notificationRoutes } from './routes/notifications.mjs';
import { agencyRoutes } from './routes/agencies.mjs';
import { footballRoutes } from './routes/football.mjs';
import { oddsRoutes } from './routes/odds.mjs';
import { adminSecurityRoutes } from './routes/admin-security.mjs';
import { operationsRoutes } from './routes/operations.mjs';
import { metrics } from './lib/metrics.mjs';
export async function createApp({ db, config }) {
  const app = express();
  config.metrics ||= metrics();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    const began = performance.now();
    req.requestId = randomUUID();
    res.set('X-Request-ID', req.requestId);
    res.on('finish', () => {
      config.metrics.observe(res.statusCode, Math.round(performance.now() - began));
      if (!config.test)
        console.log(
          JSON.stringify({
            event: 'request',
            id: req.requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
          }),
        );
    });
    next();
  });
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  app.get('/api/public/legal', (_req, res) =>
    res.json({
      publisher: 'StarWhite Interactive',
      country: 'France',
      support: 'support@betverse.fr',
      ready: Boolean(config.legalReady),
      supportVerified: Boolean(config.supportVerified),
      address: config.editorAddress || null,
      status: config.editorStatus || null,
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: config.test ? 10000 : 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Trop de requêtes. Réessayez dans une minute.' },
    }),
  );
  app.use('/api', express.json({ limit: '32kb', strict: true }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      ensure(req.get('Origin') === config.origin, 403, 'Origine de requête refusée.');
      ensure(
        req.get('X-Requested-With') === 'BetVerse' && req.is('application/json'),
        403,
        'Requête JSON attendue.',
      );
    }
    next();
  });
  const requireUser = (req, _res, next) => {
    const token = readCookie(req, config.cookieName);
    ensure(token && /^[a-f0-9]{64}$/.test(token), 401, 'Connexion requise.');
    const session = db
      .prepare('SELECT * FROM sessions WHERE tokenHash=? AND expiresAt>?')
      .get(digest(token), Date.now());
    ensure(session, 401, 'Votre session a expiré. Reconnectez-vous.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
      ensure(
        req.get('X-CSRF-Token') === session.csrf,
        403,
        'Jeton de sécurité invalide. Actualisez la page.',
      );
    req.session = session;
    req.user = publicUser(db, session.userId);
    ensure(req.user.status === 'ACTIVE', 401, 'Ce compte est suspendu. Contactez le support.');
    next();
  };
  const requireAdmin = (req, _res, next) => {
    ensure(req.user?.role === 'ADMIN', 403, 'Accès administrateur requis.');
    const enrolled = db
      .prepare('SELECT 1 FROM admin_mfa WHERE userId=? AND secretCipher IS NOT NULL')
      .get(req.user.id);
    ensure(
      !(config.adminMfaRequired || enrolled) ||
        db
          .prepare('SELECT 1 FROM session_mfa WHERE tokenHash=? AND expiresAt>?')
          .get(req.session.tokenHash, Date.now()),
      403,
      'Vérifiez la double authentification dans Administration → Sécurité.',
    );
    next();
  };
  const context = { db, config, requireUser, requireAdmin };
  app.use('/api/auth', await authRoutes(context));
  app.use('/api/wallet', requireUser, walletRoutes(context));
  app.use('/api/matches', requireUser, matchRoutes(context));
  app.use('/api/admin/football', requireUser, footballRoutes(context));
  app.use('/api/admin/odds', requireUser, oddsRoutes(context));
  app.use('/api/admin/security', requireUser, adminSecurityRoutes(context));
  app.use('/api/admin/operations', requireUser, operationsRoutes(context));
  app.use('/api/bet', requireUser, betRoutes(context));
  app.use('/api/users', requireUser, userRoutes(context));
  app.use('/api/leaderboard', requireUser, leaderboardRoutes(context));
  app.use('/api/notifications', requireUser, notificationRoutes(context));
  app.use('/api/agence', requireUser, agencyRoutes(context));
  app.use('/api', (_req, _res) => {
    throw new AppError(404, 'Endpoint introuvable.');
  });
  if (existsSync(join(config.staticDir, 'index.html'))) {
    app.use(
      express.static(config.staticDir, { index: false, maxAge: config.production ? '1h' : 0 }),
    );
    app.get('/{*path}', (req, res) => {
      if (req.path.split('/').at(-1).includes('.')) return res.sendStatus(404);
      res.set('Cache-Control', 'no-cache').sendFile(join(config.staticDir, 'index.html'));
    });
  }
  app.use((error, req, res, _next) => {
    const conflict =
      String(error.code || '').startsWith('ERR_SQLITE') && /UNIQUE constraint/.test(error.message);
    const validation = error instanceof ZodError;
    const status =
      error instanceof AppError
        ? error.status
        : validation
          ? 400
          : conflict
            ? 409
            : error.type === 'entity.too.large'
              ? 413
              : error.type === 'entity.parse.failed'
                ? 400
                : 500;
    if (status === 500)
      console.error(
        JSON.stringify({ event: 'server_error', requestId: req.requestId, error: error.message }),
      );
    const message =
      error instanceof AppError
        ? error.message
        : validation
          ? 'Données invalides. Vérifiez les champs saisis.'
          : conflict
            ? 'Cet identifiant est déjà utilisé.'
            : status === 413
              ? 'Requête trop volumineuse.'
              : status === 400
                ? 'JSON invalide.'
                : 'Une erreur interne est survenue.';
    res.status(status).json({ message, requestId: req.requestId });
  });
  return app;
}
