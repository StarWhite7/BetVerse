import { Router } from 'express';
import { z, id } from '../lib/validation.mjs';
import { manualOdds, COMPETITIONS, BOOKMAKERS } from '../domain/odds.mjs';

export function oddsRoutes(context) {
  const router = Router();
  const service = manualOdds(context);
  router.use(context.requireAdmin);
  router.get('/', (_req, res) => res.json(service.state()));
  router.post('/preview', async (req, res) => {
    const input = z
      .object({
        competition: z.enum(Object.keys(COMPETITIONS)),
        date: z.iso.date(),
        consent: z.literal(true),
      })
      .strict()
      .parse(req.body);
    res.json(await service.preview(input, id.parse(req.get('Idempotency-Key')), req.user.id));
  });
  router.post('/publish', (req, res) => {
    const input = z
      .object({
        eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
        bookmaker: z.enum(Object.keys(BOOKMAKERS)),
        snapshotId: id,
      })
      .strict()
      .parse(req.body);
    res.json(service.publish(input, req.user.id));
  });
  return router;
}
