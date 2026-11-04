import { Router } from 'express';
import { id } from '../lib/validation.mjs';
import { ensure } from '../lib/errors.mjs';
import { now } from '../domain/accounts.mjs';
export function notificationRoutes({ db }) {
  const router = Router();
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
