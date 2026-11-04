import { Router } from 'express';
import { z, id } from '../lib/validation.mjs';
import { manualFootball } from '../domain/football.mjs';

export function footballRoutes(context) {
  const router = Router();
  const football = manualFootball(context);
  router.use(context.requireAdmin);
  router.get('/', (_req, res) =>
    res.json({
      usage: football.usage(),
      fixtures: football.fixtures(),
      bookmakers: football.bookmakers(),
    }),
  );
  router.post('/bookmakers', async (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(await football.loadBookmakers(id.parse(req.get('Idempotency-Key')), req.user.id));
  });
  router.post('/fixtures', async (req, res) => {
    const input = z
      .object({
        date: z.iso.date(),
        league: z.number().int().min(1).max(100000).optional(),
        season: z.number().int().min(2000).max(2100).optional(),
      })
      .strict()
      .refine((value) => !value.season || Boolean(value.league))
      .parse(req.body);
    res.json(await football.loadFixtures(input, id.parse(req.get('Idempotency-Key')), req.user.id));
  });
  router.post('/odds', async (req, res) => {
    const input = z
      .object({
        fixtureId: z.number().int().positive(),
        bookmakerId: z.number().int().min(1).max(100000),
      })
      .strict()
      .parse(req.body);
    res.json(await football.importOdds(input, id.parse(req.get('Idempotency-Key')), req.user.id));
  });
  return router;
}
