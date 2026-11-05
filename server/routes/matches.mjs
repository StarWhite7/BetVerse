import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, amount, choice, id, queryPage } from '../lib/validation.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { now, audit } from '../domain/accounts.mjs';
import {
  matchDto,
  betDto,
  placeBet,
  placeCombinedBet,
  hasMatchBets,
  finishMatch,
  cancelMatch,
} from '../domain/matches.mjs';
import { manualFootball } from '../domain/football.mjs';
const odds = z
  .number()
  .min(1)
  .max(1000)
  .refine((x) => Math.abs(x * 100 - Math.round(x * 100)) < 0.000001, 'Deux décimales maximum.');
const matchInput = z
  .object({
    homeTeam: z.string().trim().min(2).max(80),
    awayTeam: z.string().trim().min(2).max(80),
    startDate: z.iso.datetime().transform((value) => new Date(value).toISOString()),
    oddsHome: odds,
    oddsAway: odds,
    oddsDraw: odds.nullable().optional(),
    sportKey: z.enum(['football', 'tennis', 'basketball']).default('football'),
    sportTitle: z.string().trim().min(1).max(50).default('Football'),
    competition: z.string().trim().min(1).max(80).default('Catalogue BetVerse'),
  })
  .strict();
export function matchRoutes({ db, requireAdmin, config }) {
  const router = Router();
  router.get('/', (req, res) => {
    const { status } = z
      .object({ status: z.enum(['UPCOMING', 'LIVE', 'FINISHED', 'CANCELLED']).optional() })
      .parse(req.query);
    let rows;
    const timestamp = now();
    if (status === 'UPCOMING')
      rows = db
        .prepare(
          "SELECT * FROM matches WHERE status='UPCOMING' AND startDate>? ORDER BY startDate,id LIMIT 500",
        )
        .all(timestamp);
    else if (status === 'LIVE')
      rows = db
        .prepare(
          "SELECT * FROM matches WHERE status='LIVE' OR (status='UPCOMING' AND startDate<=?) ORDER BY startDate,id LIMIT 500",
        )
        .all(timestamp);
    else if (status)
      rows = db
        .prepare('SELECT * FROM matches WHERE status=? ORDER BY startDate DESC,id LIMIT 500')
        .all(status);
    else rows = db.prepare('SELECT * FROM matches ORDER BY startDate DESC,id LIMIT 500').all();
    res.json(rows.map(matchDto));
  });
  router.get('/usage', requireAdmin, (_req, res) =>
    res.json(manualFootball({ db, config }).usage()),
  );
  router.get('/:id', (req, res) => {
    const match = db.prepare('SELECT * FROM matches WHERE id=?').get(id.parse(req.params.id));
    ensure(match, 404, 'Match introuvable.');
    res.json(matchDto(match));
  });
  router.post('/', requireAdmin, (req, res) => {
    const input = matchInput.parse(req.body);
    ensure(input.homeTeam !== input.awayTeam, 400, 'Les équipes doivent être différentes.');
    ensure(Date.parse(input.startDate) > Date.now(), 400, 'La date doit être future.');
    const matchId = randomUUID();
    transaction(db, () => {
      db.prepare(
        'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,sportKey,sportTitle,competition,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        matchId,
        input.homeTeam,
        input.awayTeam,
        input.startDate,
        Math.round(input.oddsHome * 100),
        Math.round(input.oddsAway * 100),
        input.oddsDraw ? Math.round(input.oddsDraw * 100) : null,
        input.sportKey,
        input.sportTitle,
        input.competition,
        now(),
      );
      audit(db, req.user.id, 'MATCH_CREATED', matchId);
    });
    res.status(201).json(matchDto(db.prepare('SELECT * FROM matches WHERE id=?').get(matchId)));
  });
  router.patch('/:id', requireAdmin, (req, res) => {
    const input = matchInput.partial().parse(req.body),
      matchId = id.parse(req.params.id);
    transaction(db, () => {
      const current = db.prepare('SELECT * FROM matches WHERE id=?').get(matchId);
      ensure(current, 404, 'Match introuvable.');
      ensure(
        current.status === 'UPCOMING' && Date.parse(current.startDate) > Date.now(),
        409,
        'Ce match ne peut plus être modifié.',
      );
      const dto = matchDto(current);
      const merged = matchInput.parse(
        Object.fromEntries(
          Object.keys(matchInput.shape).map((key) => [
            key,
            input[key] === undefined ? dto[key] : input[key],
          ]),
        ),
      );
      ensure(
        Date.parse(merged.startDate) > Date.now() && merged.homeTeam !== merged.awayTeam,
        400,
        'Date ou équipes invalides.',
      );
      // Do not allow rewriting the identity or kickoff after accepting stakes.
      const hasBets = hasMatchBets(db, matchId);
      ensure(
        !hasBets ||
          (merged.homeTeam === current.homeTeam &&
            merged.awayTeam === current.awayTeam &&
            merged.startDate === current.startDate),
        409,
        'Des paris existent : équipes et date sont verrouillées.',
      );
      db.prepare(
        'UPDATE matches SET homeTeam=?,awayTeam=?,startDate=?,oddsHome=?,oddsAway=?,oddsDraw=?,sportKey=?,sportTitle=?,competition=? WHERE id=?',
      ).run(
        merged.homeTeam,
        merged.awayTeam,
        merged.startDate,
        Math.round(merged.oddsHome * 100),
        Math.round(merged.oddsAway * 100),
        merged.oddsDraw ? Math.round(merged.oddsDraw * 100) : null,
        merged.sportKey,
        merged.sportTitle,
        merged.competition,
        matchId,
      );
      audit(db, req.user.id, 'MATCH_UPDATED', matchId);
    });
    res.json(matchDto(db.prepare('SELECT * FROM matches WHERE id=?').get(matchId)));
  });
  router.post('/:id/finish', requireAdmin, (req, res) => {
    const input = z
      .object({
        result: choice,
        homeScore: z.number().int().min(0).max(200),
        awayScore: z.number().int().min(0).max(200),
      })
      .strict()
      .parse(req.body);
    res.json(finishMatch(db, req.user.id, id.parse(req.params.id), input));
  });
  router.post('/:id/cancel', requireAdmin, (req, res) => {
    const { reason } = z
      .object({ reason: z.string().trim().min(10).max(300) })
      .strict()
      .parse(req.body);
    res.json(cancelMatch(db, req.user.id, id.parse(req.params.id), reason));
  });
  return router;
}
export function betRoutes({ db, requireAdmin }) {
  const router = Router();
  router.post('/combined', (req, res) => {
    const input = z
      .object({
        amount,
        selections: z
          .array(z.object({ matchId: id, betType: choice, odds }).strict())
          .min(2)
          .max(10)
          .refine((rows) => new Set(rows.map((row) => row.matchId)).size === rows.length),
      })
      .strict()
      .parse(req.body);
    res
      .status(201)
      .json(placeCombinedBet(db, req.user.id, input, id.parse(req.get('Idempotency-Key'))));
  });
  router.post('/', (req, res) => {
    const input = z
      .object({
        matchId: id,
        betType: choice,
        amount,
        odds: odds.optional(),
        match: z.string().max(200).optional(),
      })
      .strict()
      .parse(req.body);
    const requestKey = id.parse(req.get('Idempotency-Key'));
    res.status(201).json(placeBet(db, req.user.id, input, requestKey));
  });
  const list = (admin) => (req, res) => {
    const page = queryPage.parse(req.query),
      params = [],
      conditions = [];
    if (!admin) {
      conditions.push('userId=?');
      params.push(req.user.id);
    }
    if (page.status) {
      conditions.push('status=?');
      params.push(page.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sort = page.order === 'asc' ? 'ASC' : 'DESC';
    const count = db.prepare(`SELECT COUNT(*) total FROM bets ${where}`).get(...params).total;
    res.set('X-Total-Count', String(count)).json(
      db
        .prepare(
          `SELECT id,matchId,match,betType,amount,odds,status,payout,createdAt,kind FROM bets ${where} ORDER BY createdAt ${sort},id ${sort} LIMIT ? OFFSET ?`,
        )
        .all(...params, page.limit, page.skip)
        .map((row) => betDto(row, db)),
    );
  };
  router.get('/my-bets', list(false));
  router.get('/admin-bets', requireAdmin, list(true));
  return router;
}
