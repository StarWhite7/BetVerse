import { Router } from 'express';
import { id, z } from '../lib/validation.mjs';
import { ensure } from '../lib/errors.mjs';
import { now } from '../domain/accounts.mjs';
import { sealToken } from '../lib/push.mjs';
import { digest, readCookie } from '../lib/security.mjs';
export function notificationRoutes({ db, config }) {
  const router = Router();
  router.get('/push-status', (_req, res) =>
    res.json({
      available: Boolean(config.pushEnabled && config.pushTokenKey && config.pushAccountFile),
    }),
  );
  router.post('/devices', (req, res) => {
    const { token } = z
      .object({ token: z.string().regex(/^[a-zA-Z0-9_:\-]{20,4096}$/) })
      .strict()
      .parse(req.body);
    ensure(
      config.pushEnabled && config.pushTokenKey && config.pushAccountFile,
      409,
      'Push non configuré sur le serveur.',
    );
    ensure(
      db.prepare('SELECT push FROM user_preferences WHERE userId=?').get(req.user.id)?.push === 1,
      409,
      'Autorisez les notifications avant de connecter cet appareil.',
    );
    const hash = digest(token),
      previous = db.prepare('SELECT userId FROM push_devices WHERE tokenHash=?').get(hash);
    ensure(
      !previous || previous.userId === req.user.id,
      409,
      'Déconnectez d’abord le compte précédent de cet appareil.',
    );
    db.prepare(
      'INSERT INTO push_devices VALUES (?,?,?,?,?) ON CONFLICT(tokenHash) DO UPDATE SET sessionHash=excluded.sessionHash,cipher=excluded.cipher,updatedAt=excluded.updatedAt',
    ).run(
      hash,
      req.user.id,
      digest(readCookie(req, config.cookieName) || ''),
      sealToken(token, config.pushTokenKey),
      now(),
    );
    res.json({ success: true });
  });
  router.delete('/devices', (req, res) => {
    db.prepare('DELETE FROM push_devices WHERE userId=? AND sessionHash=?').run(
      req.user.id,
      digest(readCookie(req, config.cookieName) || ''),
    );
    res.json({ success: true });
  });
  router.get('/preferences', (req, res) => {
    const row = db
      .prepare('SELECT bets,agencies,push FROM user_preferences WHERE userId=?')
      .get(req.user.id) || { bets: 1, agencies: 1, push: 0 };
    res.json({ bets: Boolean(row.bets), agencies: Boolean(row.agencies), push: Boolean(row.push) });
  });
  router.patch('/preferences', (req, res) => {
    const input = z
      .object({ bets: z.boolean(), agencies: z.boolean(), push: z.boolean() })
      .strict()
      .parse(req.body);
    db.prepare(
      'INSERT INTO user_preferences (userId,bets,agencies,push) VALUES (?,?,?,?) ON CONFLICT(userId) DO UPDATE SET bets=excluded.bets,agencies=excluded.agencies,push=excluded.push',
    ).run(req.user.id, Number(input.bets), Number(input.agencies), Number(input.push));
    res.json(input);
  });
  router.get('/', (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT id,type,title,message,metadata,agencyId,inviteId,readAt,createdAt FROM notifications WHERE userId=? ORDER BY createdAt DESC,id DESC LIMIT 100',
        )
        .all(req.user.id)
        .map((n) => ({ ...n, metadata: n.metadata ? JSON.parse(n.metadata) : null })),
    ),
  );
  router.get('/unread-count', (req, res) =>
    res.json(
      db
        .prepare('SELECT COUNT(*) n FROM notifications WHERE userId=? AND readAt IS NULL')
        .get(req.user.id).n,
    ),
  );
  router.post('/read-all', (req, res) => {
    db.prepare('UPDATE notifications SET readAt=? WHERE userId=? AND readAt IS NULL').run(
      now(),
      req.user.id,
    );
    res.json({ success: true });
  });
  router.delete('/read', (req, res) => {
    db.prepare('DELETE FROM notifications WHERE userId=? AND readAt IS NOT NULL').run(req.user.id);
    res.json({ success: true });
  });
  router.patch('/:id/read', (req, res) => {
    const updated = db
      .prepare('UPDATE notifications SET readAt=COALESCE(readAt,?) WHERE id=? AND userId=?')
      .run(now(), id.parse(req.params.id), req.user.id);
    ensure(updated.changes === 1, 404, 'Notification introuvable.');
    res.json({ success: true });
  });
  return router;
}
