import { Router } from 'express';
import { z, id, username, password } from '../lib/validation.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { hashPassword, verifyPassword, cookieOptions } from '../lib/security.mjs';
import { publicUser, playerStats, audit } from '../domain/accounts.mjs';
import { betDto } from '../domain/matches.mjs';
import { exportAccount, deleteAccount } from '../domain/privacy.mjs';
export function userRoutes({ db, config, requireAdmin }) {
  const router = Router();
  router.get('/me/export', (req, res) =>
    res
      .set('Content-Disposition', 'attachment; filename="betverse-account.json"')
      .json(exportAccount(db, req.user.id)),
  );
  router.delete('/me', async (req, res) => {
    const input = z
      .object({ password: z.string().min(1).max(128), confirmation: z.literal('SUPPRIMER') })
      .strict()
      .parse(req.body);
    const result = await deleteAccount(db, req.user.id, input.password);
    if (config.backupService?.state.configured) {
      let timeout;
      try {
        await Promise.race([
          config.backupService.syncErasures(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Journal en attente')), 5000);
          }),
        ]);
      } catch {
        result.backupJournalPending = true;
      } finally {
        clearTimeout(timeout);
      }
    }
    res
      .clearCookie(config.cookieName, { ...cookieOptions(config), maxAge: undefined })
      .json(result);
  });
  router.get('/me/stats', (req, res) => res.json(playerStats(db, req.user.id)));
  router.patch('/me', (req, res) => {
    const input = z.object({ username }).strict().parse(req.body);
    db.prepare('UPDATE users SET username=? WHERE id=?').run(input.username, req.user.id);
    res.json(publicUser(db, req.user.id));
  });
  router.patch('/me/password', async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().min(1).max(128), newPassword: password })
      .strict()
      .parse(req.body);
    const stored = db
      .prepare('SELECT passwordHash FROM users WHERE id=?')
      .get(req.user.id).passwordHash;
    ensure(
      await verifyPassword(input.currentPassword, stored),
      400,
      'Mot de passe actuel incorrect.',
    );
    const hashed = await hashPassword(input.newPassword);
    transaction(db, () => {
      // Reject a concurrent reset/change that occurred while hashing.
      const updated = db
        .prepare('UPDATE users SET passwordHash=? WHERE id=? AND passwordHash=?')
        .run(hashed, req.user.id, stored);
      ensure(updated.changes === 1, 409, 'Le mot de passe a changé. Reconnectez-vous.');
      db.prepare('DELETE FROM sessions WHERE userId=?').run(req.user.id);
      db.prepare('DELETE FROM password_resets WHERE userId=?').run(req.user.id);
      audit(db, req.user.id, 'PASSWORD_CHANGED');
    });
    res
      .clearCookie(config.cookieName, { ...cookieOptions(config), maxAge: undefined })
      .json({ success: true });
  });
  router.get('/search', (req, res) => {
    const q = z
      .string()
      .max(24)
      .parse(req.query.q || '');
    // Only public identifiers; email addresses are never exposed by player search.
    res.json(
      db
        .prepare(
          'SELECT id,username FROM users WHERE instr(lower(username),lower(?))>0 ORDER BY username LIMIT 20',
        )
        .all(q),
    );
  });
  router.get('/', requireAdmin, (req, res) => {
    const q = z
      .string()
      .max(100)
      .parse(req.query.q || '');
    res.json(
      db
        .prepare(
          'SELECT id,email,username,role,createdAt,status FROM users WHERE instr(lower(email||username||id),lower(?))>0 ORDER BY createdAt DESC LIMIT 100',
        )
        .all(q),
    );
  });
  router.patch('/:id/status', requireAdmin, (req, res) => {
    const targetId = id.parse(req.params.id);
    const input = z
      .object({
        status: z.enum(['ACTIVE', 'SUSPENDED']),
        reason: z.string().trim().min(10).max(300),
      })
      .strict()
      .parse(req.body);
    ensure(targetId !== req.user.id, 409, 'Vous ne pouvez pas suspendre votre propre compte.');
    transaction(db, () => {
      const target = db.prepare('SELECT role FROM users WHERE id=?').get(targetId);
      ensure(target, 404, 'Compte introuvable.');
      ensure(
        target.role !== 'ADMIN',
        403,
        'La suspension d’un administrateur nécessite une intervention de l’éditeur.',
      );
      db.prepare('UPDATE users SET status=? WHERE id=?').run(input.status, targetId);
      db.prepare('DELETE FROM sessions WHERE userId=?').run(targetId);
      audit(db, req.user.id, 'ACCOUNT_STATUS_CHANGED', targetId, input);
    });
    res.json({ success: true });
  });
  router.get('/:id/public', (req, res) => {
    const user = publicUser(db, id.parse(req.params.id));
    const rows = db
      .prepare(
        'SELECT id,match,betType,amount,odds,status,createdAt,matchId,kind FROM bets WHERE userId=? ORDER BY createdAt DESC LIMIT 50',
      )
      .all(user.id)
      .map((row) => betDto(row, db));
    res.json({
      user: {
        id: user.id,
        username: user.username,
        initials: user.username.slice(0, 2).toUpperCase(),
        level: user.level,
        xp: user.xp,
      },
      stats: playerStats(db, user.id),
      pendingBets: rows.filter((b) => b.status === 'PENDING'),
      historyBets: rows.filter((b) => b.status !== 'PENDING'),
    });
  });
  return router;
}
export function leaderboardRoutes({ db }) {
  const router = Router();
  router.get('/', (req, res) => {
    const metric = z.enum(['verse', 'wins', 'level']).default('verse').parse(req.query.metric);
    // Aggregate in SQL before LIMIT; global ranks stay correct beyond one page.
    const order = {
      verse: 'versePossessedTotal DESC',
      wins: 'winRate DESC,betsWon DESC',
      level: 'xp DESC',
    }[metric];
    const rows = db
      .prepare(
        `WITH totals AS (
      SELECT userId,COUNT(*) betsPlayed,SUM(status='WON') betsWon,SUM(status IN ('WON','LOST')) settled,
      SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END) versePending,
      SUM(CASE WHEN status='WON' THEN payout ELSE 0 END) verseEarned FROM bets GROUP BY userId
    ) SELECT u.id,u.username,u.xp,w.balance verseWallet,COALESCE(t.versePending,0) versePending,
      w.balance+COALESCE(t.versePending,0) versePossessedTotal,COALESCE(t.betsWon,0) betsWon,
      COALESCE(t.betsPlayed,0) betsPlayed,COALESCE(t.verseEarned,0) verseEarned,
      CASE WHEN t.settled>0 THEN ROUND(100.0*t.betsWon/t.settled,2) ELSE 0 END winRate
      FROM users u JOIN wallets w ON w.userId=u.id LEFT JOIN totals t ON t.userId=u.id
      ORDER BY ${order},u.id LIMIT 100`,
      )
      .all();
    res.json(
      rows.map((row, index) => ({
        ...row,
        level: publicUser(db, row.id).level,
        initials: row.username.slice(0, 2).toUpperCase(),
        rank: index + 1,
        accent: '#22d3ee',
        verseInvested: 0,
        currentStreak: playerStats(db, row.id).currentStreak,
      })),
    );
  });
  return router;
}
