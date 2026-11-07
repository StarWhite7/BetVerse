import { Router } from 'express';
import { z } from '../lib/validation.mjs';
import { manualOdds } from '../domain/odds.mjs';
import { createResultPreview } from '../domain/result-previews.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { finishMatch } from '../domain/matches.mjs';
import { audit, now } from '../domain/accounts.mjs';
export function operationsRoutes({ db, config, requireAdmin }) {
  const router = Router();
  router.use(requireAdmin);
  router.get('/', (_req, res) =>
    res.json({
      users: db.prepare("SELECT COUNT(*) total,SUM(status='SUSPENDED') suspended FROM users").get(),
      tickets: db.prepare("SELECT COUNT(*) total,SUM(status='PENDING') pending FROM bets").get(),
      toSettle: db
        .prepare(
          "SELECT id,homeTeam,awayTeam,startDate FROM matches WHERE status IN ('UPCOMING','LIVE') AND startDate<=? ORDER BY startDate LIMIT 100",
        )
        .all(new Date().toISOString()),
      audit: db
        .prepare(
          'SELECT action,targetId,createdAt,details FROM audit_log ORDER BY createdAt DESC,rowid DESC LIMIT 100',
        )
        .all(),
      provider: manualOdds({ db, config }).state().usage,
      backup: config.backupService?.state || { configured: false },
      push: config.pushService?.state || { configured: false },
      metrics: config.metrics?.snapshot() || null,
      maintenance: Boolean(config.maintenance),
    }),
  );
  router.post('/erasure-journal', async (req, res) => {
    z.object({ confirmation: z.literal('SYNCHRONISER') })
      .strict()
      .parse(req.body);
    ensure(config.backupService, 409, 'Stockage distant non configuré.');
    await config.backupService.syncErasures(true);
    res.json({ success: true, journal: config.backupService.state.erasureJournal });
  });
  router.post('/backup', async (req, res) => {
    z.object({ confirmation: z.literal('SAUVEGARDER') })
      .strict()
      .parse(req.body);
    ensure(config.backupService, 409, 'Sauvegarde distante non configurée.');
    res.json(await config.backupService.run());
  });
  const resultRows = z
    .array(
      z
        .object({
          matchId: z.uuid(),
          homeScore: z.number().int().min(0).max(200),
          awayScore: z.number().int().min(0).max(200),
        })
        .strict(),
    )
    .min(1)
    .max(100);
  router.post('/results/preview', (req, res) => {
    const { rows } = z.object({ rows: resultRows }).strict().parse(req.body);
    ensure(
      new Set(rows.map((r) => r.matchId)).size === rows.length,
      400,
      'Une ligne par rencontre.',
    );
    res.json(createResultPreview(db, req.user.id, rows));
  });
  router.post('/results/apply', (req, res) => {
    const { id } = z
      .object({ id: z.uuid(), confirmation: z.literal('REGLER') })
      .strict()
      .parse(req.body);
    res.json(
      transaction(db, () => {
        const preview = db
          .prepare('SELECT * FROM result_previews WHERE id=? AND actorId=?')
          .get(id, req.user.id);
        ensure(preview, 404, 'Aperçu introuvable.');
        if (preview.appliedAt) return { success: true, replayed: true };
        ensure(
          Date.now() - Date.parse(preview.createdAt) < 900000,
          409,
          'Aperçu expiré. Refaire une vérification locale.',
        );
        const rows = JSON.parse(preview.rows);
        for (const row of rows) {
          if (row.providerSnapshotId) {
            const source = db
              .prepare('SELECT * FROM odds_calls WHERE id=?')
              .get(row.providerSnapshotId);
            const latest =
              source &&
              db
                .prepare(
                  "SELECT id FROM odds_calls WHERE cacheKey=? AND state='SUCCESS' ORDER BY createdAt DESC,rowid DESC LIMIT 1",
                )
                .get(source.cacheKey);
            ensure(
              source?.state === 'SUCCESS' &&
                source.cacheKey.startsWith('scores/') &&
                latest?.id === source.id,
              409,
              'Les scores ont été actualisés depuis cet aperçu. Aucun résultat appliqué.',
            );
          }
          const match = db.prepare('SELECT * FROM matches WHERE id=?').get(row.matchId);
          ensure(
            match &&
              match.homeTeam === row.homeTeam &&
              match.awayTeam === row.awayTeam &&
              match.startDate === row.startDate &&
              match.status === row.status,
            409,
            'Une rencontre a changé. Aucun résultat du lot n’a été appliqué.',
          );
          finishMatch(db, req.user.id, row.matchId, row);
        }
        db.prepare('UPDATE result_previews SET appliedAt=? WHERE id=?').run(now(), id);
        audit(db, req.user.id, 'RESULT_BATCH_APPLIED', id, { count: rows.length });
        return { success: true, count: rows.length };
      }),
    );
  });
  return router;
}
