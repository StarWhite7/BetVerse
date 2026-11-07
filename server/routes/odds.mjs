import { Router } from 'express';
import { z, id } from '../lib/validation.mjs';
import { manualOdds, COMPETITIONS, BOOKMAKERS } from '../domain/odds.mjs';

export function oddsRoutes(context) {
  const router = Router();
  const service = manualOdds(context);
  router.use(context.requireAdmin);
  router.get('/', (req, res) => res.json(service.state(req.user.id)));
  router.post('/sync', async (req, res) => {
    const input = z
      .object({
        mode: z.enum(['odds', 'scores', 'global']),
        competitions: z
          .array(z.enum(Object.keys(COMPETITIONS)))
          .min(1)
          .max(Object.keys(COMPETITIONS).length)
          .refine((keys) => new Set(keys).size === keys.length),
        date: z.iso.date(),
        bookmaker: z.enum(Object.keys(BOOKMAKERS)),
        consent: z.literal(true),
      })
      .strict()
      .parse(req.body);
    res.json(await service.sync(input, id.parse(req.get('Idempotency-Key')), req.user.id));
  });
  for (const [path, method] of [
    ['refresh-global', 'refreshGlobal'],
    ['scores-batch', 'previewScores'],
  ]) {
    router.post(`/${path}`, async (req, res) => {
      const input = z
        .object({
          competitions: z
            .array(z.enum(Object.keys(COMPETITIONS)))
            .min(1)
            .max(5)
            .refine((keys) => new Set(keys).size === keys.length),
          date: z.iso.date(),
          consent: z.literal(true),
        })
        .strict()
        .parse(req.body);
      res.json(await service[method](input, id.parse(req.get('Idempotency-Key')), req.user.id));
    });
  }
  router.post('/preview-batch', async (req, res) => {
    const input = z
      .object({
        competitions: z
          .array(z.enum(Object.keys(COMPETITIONS)))
          .min(1)
          .max(5)
          .refine((keys) => new Set(keys).size === keys.length),
        date: z.iso.date(),
        consent: z.literal(true),
      })
      .strict()
      .parse(req.body);
    res.json(await service.previewBatch(input, id.parse(req.get('Idempotency-Key')), req.user.id));
  });
  router.post('/publish-batch', (req, res) => {
    const input = z
      .object({
        fixtures: z
          .array(
            z
              .object({
                eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
                bookmaker: z.enum(Object.keys(BOOKMAKERS)),
                snapshotId: id,
              })
              .strict(),
          )
          .min(1)
          .max(200)
          .refine((rows) => new Set(rows.map((row) => row.eventId)).size === rows.length),
      })
      .strict()
      .parse(req.body);
    res.json(service.publishBatch(input, req.user.id));
  });
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
