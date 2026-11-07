import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, amount, username, id } from '../lib/validation.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { wallet, movement, audit, now } from '../domain/accounts.mjs';
import { adminCommand } from '../domain/admin-commands.mjs';
export function walletRoutes({ db, requireAdmin }) {
  const router = Router();
  const command = (req, input, action) =>
    adminCommand(db, req.user.id, id.parse(req.get('Idempotency-Key')), req.path, input, action);
  router.get('/', (req, res) => res.json(wallet(db, req.user.id)));
  router.get('/history', (req, res) => {
    const { limit, skip } = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        skip: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    res.json(
      db
        .prepare(
          'SELECT id,amount,type,reason,createdAt FROM ledger WHERE userId=? ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?',
        )
        .all(req.user.id, limit, skip),
    );
  });
  router.post('/claim', (req, res) => {
    transaction(db, () => {
      const timestamp = Date.now();
      const updated = db
        .prepare(
          'UPDATE wallets SET lastClaimAt=?,updatedAt=? WHERE userId=? AND (lastClaimAt IS NULL OR lastClaimAt<=?)',
        )
        .run(timestamp, now(), req.user.id, timestamp - 86400000);
      ensure(updated.changes === 1, 409, 'Le bonus est disponible une fois toutes les 24 heures.');
      movement(db, req.user.id, 500, 'CREDIT', 'DAILY_REWARD', String(timestamp));
    });
    res.json(wallet(db, req.user.id));
  });
  for (const [path, type] of [
    ['credit', 'CREDIT'],
    ['debit', 'DEBIT'],
  ]) {
    router.post(`/${path}`, requireAdmin, (req, res) => {
      const input = z.object({ amount }).strict().parse(req.body);
      command(req, input, () => {
        const reference = randomUUID();
        movement(db, req.user.id, input.amount, type, 'ADMIN_ADJUSTMENT', reference);
        audit(db, req.user.id, `WALLET_${type}`, req.user.id, { amount: input.amount, reference });
      });
      res.json(wallet(db, req.user.id));
    });
  }
  router.post('/transfer', requireAdmin, (req, res) => {
    const input = z.object({ username, amount }).strict().parse(req.body);
    command(req, input, () => {
      const target = db.prepare('SELECT id FROM users WHERE username=?').get(input.username);
      ensure(target && target.id !== req.user.id, 400, 'Destinataire invalide.');
      const reference = randomUUID();
      movement(db, req.user.id, input.amount, 'DEBIT', 'TRANSFER', reference);
      movement(db, target.id, input.amount, 'CREDIT', 'TRANSFER', reference);
      audit(db, req.user.id, 'TRANSFER', target.id, { amount: input.amount, reference });
    });
    res.json(wallet(db, req.user.id));
  });
  router.post('/admin-credit/:userId', requireAdmin, (req, res) => {
    const userId = id.parse(req.params.userId);
    const input = z
      .object({ currency: z.enum(['VERSE', 'SHARDS']), amount })
      .strict()
      .parse(req.body);
    command(req, input, () => {
      const previous = wallet(db, userId);
      if (input.currency === 'VERSE') {
        movement(db, userId, input.amount, 'CREDIT', 'ADMIN_ADJUSTMENT', randomUUID());
      } else {
        const updated = db
          .prepare(
            'UPDATE wallets SET shards=shards+?,updatedAt=? WHERE userId=? AND shards+?<=1000000000000',
          )
          .run(input.amount, now(), userId, input.amount);
        ensure(updated.changes === 1, 409, 'Plafond de Shards atteint.');
      }
      const before = input.currency === 'VERSE' ? previous.balance : previous.shards;
      audit(db, req.user.id, 'PLAYER_WALLET_CREDITED', userId, {
        ...input,
        before,
        after: before + input.amount,
      });
    });
    const { balance, shards } = wallet(db, userId);
    res.json({ balance, shards });
  });
  return router;
}
