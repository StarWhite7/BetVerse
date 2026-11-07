import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../db/database.mjs';
import { manualOdds } from '../domain/odds.mjs';
import { configFromEnv } from '../lib/config.mjs';
import { createUser, movement } from '../domain/accounts.mjs';
import { placeBet } from '../domain/matches.mjs';

function setup(t, options = {}) {
  // Expiry scenarios advance an hour: keep their input date valid across real UTC midnight.
  let clock = Date.parse('2030-01-15T12:00:00Z');
  t.mock.method(Date, 'now', () => clock);
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const actor = createUser(db, {
    email: 'admin@example.test',
    username: 'admin',
    passwordHash: 'unused',
    role: 'ADMIN',
  }).id;
  const requests = [];
  const event = () => ({
    id: 'event-1',
    sport_key: 'soccer_france_ligue_one',
    home_team: 'Home FC',
    away_team: 'Away FC',
    commence_time: new Date(clock + 86400000).toISOString(),
    bookmakers: [
      {
        key: 'betclic_fr',
        last_update: new Date(clock).toISOString(),
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Home FC', price: 1.8 },
              { name: 'Draw', price: 3.1 },
              { name: 'Away FC', price: 2.4 },
            ],
          },
        ],
      },
    ],
  });
  const config = {
    oddsMode: 'manual',
    oddsKey: 'fake-test-key',
    oddsDailyLimit: 10,
    oddsMonthlyLimit: 400,
    ...options.config,
    oddsFetch: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return options.fetcher
        ? options.fetcher(event(), url)
        : Response.json([event()], { headers: { 'x-requests-remaining': '499' } });
    },
  };
  const input = {
    competition: 'soccer_france_ligue_one',
    date: new Date(clock).toISOString().slice(0, 10),
    consent: true,
  };
  const service = manualOdds({ db, config });
  return {
    db,
    actor,
    config,
    input,
    requests,
    service,
    event,
    advance: (ms = 61000) => {
      clock += ms;
    },
    preview: (key = randomUUID()) => service.preview(input, key, actor),
    publish: (fixture) =>
      service.publish(
        { eventId: fixture.externalId, bookmaker: 'betclic_fr', snapshotId: fixture.snapshotId },
        actor,
      ),
  };
}

test('The Odds API is disabled with a key alone; only manual mode and bounded limits are accepted', async (t) => {
  assert.equal(configFromEnv({ THE_ODDS_API_KEY: 'unused' }).oddsMode, 'disabled');
  assert.throws(() => configFromEnv({ THE_ODDS_API_MODE: 'auto' }));
  assert.throws(() => configFromEnv({ THE_ODDS_API_MONTHLY_LIMIT: '501' }));
  assert.throws(() => configFromEnv({ THE_ODDS_API_DAILY_LIMIT: '0' }));
  const f = setup(t, { config: { oddsMode: 'disabled' } });
  f.service.state();
  await assert.rejects(f.preview(), /désactivé/);
  assert.equal(f.requests.length, 0);
});

test('one preview loads seven UTC days and prices; explicit publication uses no provider quota', async (t) => {
  const f = setup(t);
  await assert.rejects(
    f.service.preview({ ...f.input, consent: false }, randomUUID(), f.actor),
    /explicitement/,
  );
  await assert.rejects(
    f.service.preview({ ...f.input, competition: '../evil' }, randomUUID(), f.actor),
  );
  await assert.rejects(
    f.service.preview({ ...f.input, date: '2099-01-01' }, randomUUID(), f.actor),
  );
  assert.equal(f.requests.length, 0);
  const preview = await f.preview();
  const { url, init } = f.requests[0];
  assert.equal(url.origin, 'https://api.the-odds-api.com');
  assert.equal(url.pathname, '/v4/sports/soccer_france_ligue_one/odds/');
  assert.equal(url.searchParams.get('regions'), 'fr');
  assert.equal(url.searchParams.get('markets'), 'h2h');
  assert.equal(url.searchParams.get('oddsFormat'), 'decimal');
  assert.equal(
    Date.parse(url.searchParams.get('commenceTimeTo')) -
      Date.parse(url.searchParams.get('commenceTimeFrom')),
    7 * 86400000 - 1000,
  );
  assert.equal(init.redirect, 'error');
  assert.equal(preview.usage.providerRemaining, 499);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
  const result = f.publish(preview.fixtures[0]);
  const match = f.db.prepare('SELECT * FROM matches WHERE id=?').get(result.matchId);
  assert.deepEqual([match.oddsHome, match.oddsDraw, match.oddsAway], [180, 310, 240]);
  assert.equal(f.publish(preview.fixtures[0]).matchId, result.matchId);
  assert.equal(f.requests.length, 1);
  assert.equal(JSON.stringify(result).includes('fake-test-key'), false);
});

test('stored cache, idempotency, expiry and quotas survive service recreation', async (t) => {
  const f = setup(t);
  const key = randomUUID();
  await f.preview(key);
  const restarted = manualOdds({ db: f.db, config: f.config });
  assert.equal((await restarted.preview(f.input, key, f.actor)).cached, true);
  const cached = await restarted.preview(f.input, randomUUID(), f.actor);
  assert.equal(cached.cached, true);
  assert.equal(cached.usage.dailyUsed, 1);
  await assert.rejects(
    restarted.preview({ ...f.input, competition: 'soccer_epl' }, key, f.actor),
    /autre action/,
  );
  f.advance(3600001);
  assert.throws(() => f.publish(cached.fixtures[0]), /expirées/);
  await f.preview();
  await assert.rejects(restarted.preview(f.input, key, f.actor), /plus récent/);
  assert.equal(f.requests.length, 2);
});

test('network failures and provider error bodies never disclose the key or retry', async (t) => {
  const f = setup(t, {
    config: { oddsDailyLimit: 1 },
    fetcher: async () => {
      throw new Error('https://fake/?apiKey=fake-test-key');
    },
  });
  const key = randomUUID();
  await assert.rejects(f.preview(key), /sans relance/);
  await assert.rejects(f.preview(key), /déjà tentée/);
  f.advance();
  await assert.rejects(f.preview(), /Plafond local/);
  assert.equal(f.requests.length, 1);
  assert.equal(JSON.stringify(f.service.state()).includes('fake-test-key'), false);
  assert.equal(
    JSON.stringify(f.db.prepare('SELECT * FROM odds_calls').all()).includes('fake-test-key'),
    false,
  );
});

test('concurrent clicks, cooldown, rolling monthly cap and provider zero quota prevent extra calls', async (t) => {
  let release;
  const f = setup(t, {
    fetcher: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const one = f.preview();
  await assert.rejects(f.preview(), /en cours/);
  release(Response.json([], { headers: { 'x-requests-remaining': '0' } }));
  await one;
  await assert.rejects(
    f.service.preview({ ...f.input, competition: 'soccer_epl' }, randomUUID(), f.actor),
    /épuisé/,
  );
  f.db.prepare('UPDATE odds_calls SET remaining=499').run();
  await assert.rejects(
    f.service.preview({ ...f.input, competition: 'soccer_epl' }, randomUUID(), f.actor),
    /une minute/,
  );
  f.advance();
  f.config.oddsMonthlyLimit = 1;
  await assert.rejects(
    f.service.preview({ ...f.input, competition: 'soccer_epl' }, randomUUID(), f.actor),
    /Plafond local/,
  );
  assert.equal(f.requests.length, 1);
});

test('missing, stale, invalid odds and live matches cannot be published; no bookmaker fallback', async (t) => {
  const f = setup(t, {
    fetcher: async (event) => {
      const missing = structuredClone(event);
      missing.id = 'missing';
      missing.bookmakers[0].markets[0].outcomes.pop();
      const stale = structuredClone(event);
      stale.id = 'stale';
      stale.bookmakers[0].last_update = '2000-01-01T00:00:00Z';
      const live = structuredClone(event);
      live.id = 'live';
      live.commence_time = '2000-01-01T00:00:00Z';
      const invalid = structuredClone(event);
      invalid.id = 'invalid';
      invalid.bookmakers[0].markets[0].outcomes[0].price = 1.234;
      return Response.json([missing, stale, live, invalid]);
    },
  });
  const state = await f.preview();
  assert.equal(state.fixtures.length, 3);
  for (const fixture of state.fixtures) assert.throws(() => f.publish(fixture), /absentes/);
  assert.equal(f.requests.length, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
});

test('existing manual matches are reused; accepted bets keep their odds and prevent identity changes', async (t) => {
  const f = setup(t);
  const state = await f.preview();
  const fixture = state.fixtures[0];
  const id = randomUUID();
  f.db
    .prepare(
      'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,createdAt) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      fixture.homeTeam,
      fixture.awayTeam,
      fixture.startDate,
      200,
      300,
      400,
      new Date(Date.now()).toISOString(),
    );
  assert.equal(f.publish(fixture).matchId, id);
  movement(f.db, f.actor, 500, 'CREDIT', 'TEST', randomUUID());
  const bet = placeBet(f.db, f.actor, { matchId: id, betType: 'HOME', amount: 100 }, randomUUID());
  f.db
    .prepare('UPDATE odds_fixtures SET quotes=?')
    .run(
      JSON.stringify([
        { bookmaker: 'betclic_fr', home: 210, draw: 300, away: 310, updatedAt: Date.now() },
      ]),
    );
  f.publish(fixture);
  assert.equal(f.db.prepare('SELECT odds FROM bets WHERE id=?').get(bet.id).odds, 180);
  assert.equal(f.db.prepare('SELECT oddsHome FROM matches WHERE id=?').get(id).oddsHome, 210);
  f.db.prepare("UPDATE odds_fixtures SET homeTeam='Changed FC'").run();
  assert.throws(() => f.publish(fixture), /verrouillées/);
  f.db.prepare("UPDATE matches SET status='CANCELLED' WHERE id=?").run(id);
  assert.throws(() => f.publish(fixture), /plus être modifié/);
  assert.equal(f.requests.length, 1);
});

test('HTTP errors are sanitized and recorded, not treated as successful empty calendars', async (t) => {
  const f = setup(t, {
    fetcher: async () => Response.json({ message: 'fake-test-key' }, { status: 401 }),
  });
  await assert.rejects(f.preview(), /HTTP 401/);
  assert.equal(f.service.state().usage.dailyUsed, 1);
  assert.equal(f.service.state().usage.lastError.includes('fake-test-key'), false);
});

test('closing and reopening the database preserves the quota and cached prices', async (t) => {
  const f = setup(t);
  const directory = await mkdtemp(join(tmpdir(), 'betverse-odds-'));
  const path = join(directory, 'test.sqlite');
  let db = openDatabase(path);
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const actor = createUser(db, {
    email: 'admin2@example.test',
    username: 'admin2',
    passwordHash: 'unused',
    role: 'ADMIN',
  }).id;
  await manualOdds({ db, config: f.config }).preview(f.input, randomUUID(), actor);
  db.close();
  db = openDatabase(path);
  const service = manualOdds({ db, config: f.config });
  assert.equal(service.state().usage.dailyUsed, 1);
  assert.equal((await service.preview(f.input, randomUUID(), actor)).cached, true);
  assert.equal(f.requests.length, 1);
});

test('an older cached preview cannot restore games omitted by a newer empty snapshot', async (t) => {
  let empty = false;
  const f = setup(t, { fetcher: async (event) => Response.json(empty ? [] : [event]) });
  const key = randomUUID();
  const first = await f.preview(key);
  f.advance(3600001);
  empty = true;
  await f.preview();
  await assert.rejects(f.preview(key), /plus récent/);
  assert.throws(() => f.publish(first.fixtures[0]), /absentes/);
  assert.equal(f.requests.length, 2);
});

test('one explicit batch loads five competitions exactly once and its receipt survives a restart', async (t) => {
  const f = setup(t, {
    fetcher: async (event, url) => {
      const competition = new URL(url).pathname.split('/')[3];
      const home = `Home ${competition}`;
      event.bookmakers[0].markets[0].outcomes[0].name = home;
      return Response.json([
        { ...event, id: competition, sport_key: competition, home_team: home },
      ]);
    },
  });
  const competitions = [
    'soccer_france_ligue_one',
    'soccer_epl',
    'soccer_spain_la_liga',
    'soccer_italy_serie_a',
    'soccer_germany_bundesliga',
  ];
  const input = { competitions, date: f.input.date, consent: true },
    key = randomUUID();
  const result = await f.service.previewBatch(input, key, f.actor);
  assert.equal(f.requests.length, 5);
  assert.equal(result.fixtures.length, 5);
  assert.equal(result.usage.dailyUsed, 5);
  assert.ok(result.batchResults.every((row) => row.status === 'LOADED'));
  const restarted = manualOdds({ db: f.db, config: f.config });
  assert.ok(
    (await restarted.previewBatch(input, key, f.actor)).batchResults.every(
      (row) => row.status === 'CACHED',
    ),
  );
  assert.equal(f.requests.length, 5);
  await assert.rejects(
    restarted.previewBatch({ ...input, competitions: ['soccer_epl'] }, key, f.actor),
    /autre sélection/,
  );
  const selected = result.fixtures.map((row) => ({
    eventId: row.externalId,
    bookmaker: 'betclic_fr',
    snapshotId: row.snapshotId,
  }));
  assert.equal(restarted.publishBatch({ fixtures: selected }, f.actor).publishedCount, 5);
  assert.equal(f.requests.length, 5);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 5);
  assert.ok(restarted.state().fixtures.every((row) => row.current.home === 180));
});

test('batch preflight rejects duplicate selections and insufficient quota without spending anything', async (t) => {
  const f = setup(t, { config: { oddsDailyLimit: 1 } });
  const input = {
    competitions: ['soccer_france_ligue_one', 'soccer_epl'],
    date: f.input.date,
    consent: true,
  };
  await assert.rejects(f.service.previewBatch(input, randomUUID(), f.actor), /insuffisant/);
  await assert.rejects(
    f.service.previewBatch(
      { ...input, competitions: ['soccer_epl', 'soccer_epl'] },
      randomUUID(),
      f.actor,
    ),
    /distinctes/,
  );
  await assert.rejects(
    f.service.previewBatch(
      { ...input, competitions: ['soccer_epl'], consent: false },
      randomUUID(),
      f.actor,
    ),
  );
  assert.equal(f.requests.length, 0);
});

test('a batch stops at its first failure and concurrent batches or single previews cannot interleave', async (t) => {
  let release;
  const f = setup(t, {
    fetcher: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const input = {
      competitions: ['soccer_france_ligue_one', 'soccer_epl'],
      date: f.input.date,
      consent: true,
    },
    key = randomUUID();
  const pending = f.service.previewBatch(input, key, f.actor);
  await assert.rejects(f.service.previewBatch(input, randomUUID(), f.actor), /en cours/);
  await assert.rejects(f.preview(), /groupé/);
  release(Response.json({ message: 'fake-test-key' }, { status: 429 }));
  const result = await pending;
  assert.deepEqual(
    result.batchResults.map((row) => row.status),
    ['FAILED', 'SKIPPED'],
  );
  assert.equal(JSON.stringify(result).includes('fake-test-key'), false);
  await f.service.previewBatch(input, key, f.actor);
  assert.equal(f.requests.length, 1);
});

test('bulk publication rolls every row and audit back on a late conflict; valid replay does not duplicate matches', async (t) => {
  const f = setup(t, {
    fetcher: async (event) =>
      Response.json([
        event,
        {
          ...event,
          id: 'event-2',
          home_team: 'Other FC',
          bookmakers: [
            {
              ...event.bookmakers[0],
              markets: [
                {
                  key: 'h2h',
                  outcomes: [
                    { name: 'Other FC', price: 2.1 },
                    { name: 'Draw', price: 3.1 },
                    { name: 'Away FC', price: 2.4 },
                  ],
                },
              ],
            },
          ],
        },
      ]),
  });
  const result = await f.preview();
  const fixtures = result.fixtures.map((row) => ({
    eventId: row.externalId,
    bookmaker: 'betclic_fr',
    snapshotId: row.snapshotId,
  }));
  const beforeAudit = f.db.prepare('SELECT COUNT(*) n FROM audit_log').get().n;
  f.db.prepare("UPDATE odds_fixtures SET fetchedAt=0 WHERE externalId='event-2'").run();
  assert.throws(() => f.service.publishBatch({ fixtures }, f.actor), /expirées/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM audit_log').get().n, beforeAudit);
  f.db.prepare('UPDATE odds_fixtures SET fetchedAt=?').run(Date.now());
  assert.equal(f.service.publishBatch({ fixtures }, f.actor).publishedCount, 2);
  f.service.publishBatch({ fixtures }, f.actor);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 2);
  assert.equal(f.requests.length, 1);
});

test('global refresh shares durable quota: five leagues, ten calls, fifteen credits, cache replay is free', async (t) => {
  const f = setup(t, {
    fetcher: async (event, url) => {
      const key = new URL(url).pathname.split('/')[3];
      return Response.json(
        url.includes('/scores/') ? [] : [{ ...event, id: key, sport_key: key }],
        { headers: { 'x-requests-remaining': '499' } },
      );
    },
  });
  const input = {
    competitions: [
      'soccer_france_ligue_one',
      'soccer_epl',
      'soccer_spain_la_liga',
      'soccer_italy_serie_a',
      'soccer_germany_bundesliga',
    ],
    date: f.input.date,
    consent: true,
  };
  const id = randomUUID();
  const result = await f.service.refreshGlobal(input, id, f.actor);
  assert.equal(f.requests.length, 10);
  assert.equal(result.usage.dailyUsed, 10);
  assert.equal(result.usage.monthlyUsed, 15);
  assert.equal(result.resultPreview, null);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
  for (const { url } of f.requests.filter((r) => r.url.pathname.includes('/scores/')))
    assert.equal(url.searchParams.get('daysFrom'), '3');
  const restarted = manualOdds({ db: f.db, config: f.config });
  await restarted.refreshGlobal(input, id, f.actor);
  const cached = await restarted.refreshGlobal(input, randomUUID(), f.actor);
  assert.ok(cached.batchResults.every((row) => row.status === 'CACHED'));
  assert.equal(cached.usage.monthlyUsed, 15);
  assert.equal(f.requests.length, 10);
});

test('global refresh reserves the full weighted budget before making any provider call', async (t) => {
  const f = setup(t, { config: { oddsMonthlyLimit: 2 } });
  const input = { competitions: ['soccer_epl'], date: f.input.date, consent: true };
  await assert.rejects(f.service.refreshGlobal(input, randomUUID(), f.actor), /insuffisant/);
  await assert.rejects(
    f.service.refreshGlobal(
      { ...input, competitions: ['soccer_uefa_champs_league'] },
      randomUUID(),
      f.actor,
    ),
    /cinq grands/,
  );
  assert.equal(f.requests.length, 0);
  assert.equal(f.service.state().usage.monthlyUsed, 0);
});

test('global refresh stops on score failure, counts the attempt, never retries or leaks its key', async (t) => {
  const f = setup(t, {
    fetcher: async (event, url) =>
      url.includes('/scores/')
        ? Response.json({ error: 'fake-test-key' }, { status: 429 })
        : Response.json([event]),
  });
  const input = {
      competitions: ['soccer_france_ligue_one', 'soccer_epl'],
      date: f.input.date,
      consent: true,
    },
    id = randomUUID();
  const result = await f.service.refreshGlobal(input, id, f.actor);
  assert.deepEqual(
    result.batchResults.map((r) => r.status),
    ['LOADED', 'FAILED', 'SKIPPED', 'SKIPPED'],
  );
  assert.equal(result.usage.monthlyUsed, 3);
  assert.equal(JSON.stringify(result).includes('fake-test-key'), false);
  await f.service.refreshGlobal(input, id, f.actor);
  f.service.state(f.actor);
  assert.equal(f.requests.length, 2);
});

test('scores only preview completed linked games; identity conflicts and live scores cannot settle a ticket', async (t) => {
  let data = [];
  const f = setup(t, {
    fetcher: async (event, url) => Response.json(url.includes('/scores/') ? data : [event]),
  });
  const catalogue = await f.preview();
  const matchId = f.publish(catalogue.fixtures[0]).matchId;
  const past = new Date(Date.now() - 7200000).toISOString();
  f.db.prepare('UPDATE matches SET startDate=? WHERE id=?').run(past, matchId);
  f.advance();
  const result = {
    ...f.event(),
    commence_time: past,
    completed: true,
    last_update: new Date(Date.now()).toISOString(),
    scores: [
      { name: 'Away FC', score: '1' },
      { name: 'Home FC', score: '2' },
    ],
  };
  data = [result, { ...result, id: 'unpublished' }, { ...result, id: 'live', completed: false }];
  const input = { competitions: ['soccer_france_ligue_one'], date: f.input.date, consent: true };
  const first = await f.service.previewScores(input, randomUUID(), f.actor);
  assert.equal(first.resultPreview.rows.length, 1);
  assert.equal(first.resultPreview.rows[0].matchId, matchId);
  assert.equal(first.resultPreview.rows[0].homeScore, 2);
  assert.equal(first.scores.find((r) => r.externalId === 'unpublished').eligible, false);
  assert.equal(
    first.scores.some((r) => r.externalId === 'live'),
    false,
  );
  assert.equal(
    f.db.prepare('SELECT status FROM matches WHERE id=?').get(matchId).status,
    'UPCOMING',
  );
  assert.equal(f.service.state(f.actor).resultPreview.id, first.resultPreview.id);
  assert.equal(f.service.state().resultPreview, null);
  f.advance(300001);
  data = [
    {
      ...result,
      home_team: 'Other FC',
      scores: [
        { name: 'Other FC', score: '2' },
        { name: 'Away FC', score: '1' },
      ],
    },
  ];
  const conflict = await f.service.previewScores(input, randomUUID(), f.actor);
  assert.equal(conflict.resultPreview, null);
  assert.equal(conflict.scores[0].eligible, false);
  assert.match(conflict.scores[0].reason, /Conflit/);
});
