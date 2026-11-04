import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../db/database.mjs';
import { manualFootball } from '../domain/football.mjs';
import { configFromEnv } from '../lib/config.mjs';
import { createUser, movement } from '../domain/accounts.mjs';
import { placeBet } from '../domain/matches.mjs';
import { transaction } from '../lib/errors.mjs';

function setup(t, { limit = 10, fetcher } = {}) {
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const actor = createUser(db, {
    email: 'admin@example.test',
    username: 'admin',
    passwordHash: 'unused',
    role: 'ADMIN',
  });
  const requests = [];
  const kickoff = new Date(clock + 86400000).toISOString();
  const fixture = {
    fixture: { id: 1234, date: kickoff, status: { short: 'NS' } },
    league: { id: 61, name: 'Test League' },
    teams: { home: { name: 'Home FC' }, away: { name: 'Away FC' } },
  };
  const config = {
    footballMode: 'manual',
    footballKey: 'fake-test-key-not-a-secret',
    footballDailyLimit: limit,
    footballFetch: async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (fetcher) return fetcher(url, options);
      const path = new URL(url).pathname;
      const response =
        path === '/fixtures'
          ? [fixture]
          : path === '/odds/bookmakers'
            ? [{ id: 55, name: 'Test bookmaker' }]
            : [
                {
                  fixture: { id: 1234 },
                  bookmakers: [
                    {
                      id: 55,
                      bets: [
                        {
                          id: 1,
                          values: [
                            { value: 'Home', odd: '1.80' },
                            { value: 'Draw', odd: '3.10' },
                            { value: 'Away', odd: '2.40' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ];
      return Response.json(
        { errors: [], paging: { current: 1, total: 99 }, response },
        {
          headers: { 'x-ratelimit-requests-remaining': '97' },
        },
      );
    },
  };
  return {
    db,
    actor: actor.id,
    fixture,
    requests,
    config,
    service: manualFootball({ db, config }),
    advance: (ms = 61000) => {
      clock += ms;
    },
  };
}

test('API Football defaults off and rejects automatic modes, even with a key', async (t) => {
  assert.equal(configFromEnv({ API_FOOTBALL_KEY: 'unused' }).footballMode, 'disabled');
  assert.throws(() => configFromEnv({ API_FOOTBALL_MODE: 'auto' }), /disabled ou manual/);
  assert.throws(() => configFromEnv({ API_FOOTBALL_DAILY_LIMIT: '1000' }), /entier/);
  const f = setup(t);
  const disabled = manualFootball({ db: f.db, config: { ...f.config, footballMode: 'disabled' } });
  disabled.usage();
  disabled.fixtures();
  disabled.bookmakers();
  await assert.rejects(
    disabled.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor),
    /désactivé/,
  );
  assert.equal(f.requests.length, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM football_calls').get().n, 0);
});

test('calendar, bookmaker list and 1X2 imports each make exactly one request, without pagination', async (t) => {
  const f = setup(t);
  assert.equal(f.requests.length, 0);
  await f.service.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor);
  assert.equal(f.requests.length, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
  f.advance();
  await f.service.loadBookmakers(randomUUID(), f.actor);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].url.href, 'https://v3.football.api-sports.io/odds/bookmakers');
  f.advance();
  const result = await f.service.importOdds(
    { fixtureId: 1234, bookmakerId: 55 },
    randomUUID(),
    f.actor,
  );
  assert.equal(f.requests.length, 3);
  const request = f.requests[2];
  assert.equal(request.url.origin, 'https://v3.football.api-sports.io');
  assert.equal(request.url.searchParams.get('fixture'), '1234');
  assert.equal(request.url.searchParams.get('bet'), '1');
  assert.equal(request.url.searchParams.get('bookmaker'), '55');
  assert.equal(request.url.searchParams.get('page'), '1');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['x-apisports-key'], f.config.footballKey);
  const match = f.db.prepare('SELECT * FROM matches WHERE id=?').get(result.matchId);
  assert.equal(match.oddsHome, 180);
  assert.equal(match.oddsDraw, 310);
  assert.equal(match.oddsAway, 240);
  assert.equal(result.usage.providerRemaining, 97);
});

test('cache and request keys survive service recreation; repeated imports do not duplicate matches', async (t) => {
  const f = setup(t);
  const input = { date: '2026-11-04' },
    key = randomUUID();
  await f.service.loadFixtures(input, key, f.actor);
  const restarted = manualFootball({ db: f.db, config: f.config });
  assert.equal((await restarted.loadFixtures(input, key, f.actor)).cached, true);
  const cacheKey = randomUUID();
  assert.equal((await restarted.loadFixtures(input, cacheKey, f.actor)).cached, true);
  assert.equal(f.requests.length, 1);
  assert.equal(restarted.usage().used, 1);
  await assert.rejects(
    restarted.loadFixtures({ date: '2026-11-05' }, cacheKey, f.actor),
    /autre action/,
  );
  f.advance();
  const one = await restarted.importOdds(
    { fixtureId: 1234, bookmakerId: 55 },
    randomUUID(),
    f.actor,
  );
  const two = await restarted.importOdds(
    { fixtureId: 1234, bookmakerId: 55 },
    randomUUID(),
    f.actor,
  );
  assert.equal(one.matchId, two.matchId);
  assert.equal(two.cached, true);
  assert.equal(f.requests.length, 2);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 1);
});

test('expired response bodies are pruned without replaying old command keys', async (t) => {
  const f = setup(t);
  const key = randomUUID(),
    cacheKey = randomUUID();
  await f.service.loadFixtures({ date: '2026-11-04' }, key, f.actor);
  await f.service.loadFixtures({ date: '2026-11-04' }, cacheKey, f.actor);
  assert.equal(
    f.db.prepare('SELECT payload FROM football_calls WHERE id=?').get(cacheKey).payload,
    null,
  );
  f.advance(86400001);
  await assert.rejects(f.service.loadFixtures({ date: '2026-11-04' }, key, f.actor), /expiré/);
  await assert.rejects(f.service.loadFixtures({ date: '2026-11-04' }, cacheKey, f.actor), /expiré/);
  assert.equal(
    f.db.prepare('SELECT payload FROM football_calls WHERE id=?').get(key).payload,
    null,
  );
  assert.equal(f.requests.length, 1);
});

test('failed attempts consume the persistent local budget; no retry on errors or restarts', async (t) => {
  const f = setup(t, {
    limit: 1,
    fetcher: async () => {
      throw new Error('contains-fake-key');
    },
  });
  const key = randomUUID();
  await assert.rejects(f.service.loadFixtures({ date: '2026-11-04' }, key, f.actor), (error) => {
    assert.equal(error.message.includes('contains-fake-key'), false);
    return error.status === 502;
  });
  assert.equal(f.requests.length, 1);
  const restarted = manualFootball({ db: f.db, config: f.config });
  await assert.rejects(
    restarted.loadFixtures({ date: '2026-11-04' }, key, f.actor),
    /déjà été tentée/,
  );
  f.advance();
  await assert.rejects(
    restarted.loadFixtures({ date: '2026-11-05' }, randomUUID(), f.actor),
    /Plafond local/,
  );
  assert.equal(f.requests.length, 1);
  assert.equal(restarted.usage().remaining, 0);
});

test('parallel clicks and global cooldown cannot trigger a second upstream request', async (t) => {
  let release;
  const f = setup(t, {
    fetcher: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = f.service.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor);
  assert.equal(f.requests.length, 1);
  await assert.rejects(
    f.service.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor),
    /en cours/,
  );
  release(Response.json({ errors: [], response: [] }));
  await pending;
  await assert.rejects(
    f.service.loadFixtures({ date: '2026-11-05' }, randomUUID(), f.actor),
    /une minute/,
  );
  assert.equal(f.requests.length, 1);
});

test('HTTP 200 provider errors are sanitized and never trigger a fallback request', async (t) => {
  const f = setup(t, {
    fetcher: async () => Response.json({ errors: { token: 'fake-private-value' }, response: [] }),
  });
  await assert.rejects(
    f.service.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor),
    (error) => {
      assert.equal(error.message.includes('fake-private-value'), false);
      return error.status === 502;
    },
  );
  assert.equal(f.requests.length, 1);
  assert.equal(f.service.usage().used, 1);
});

test('bookmaker access failures have a persistent safe diagnostic, without another provider call', async (t) => {
  const f = setup(t, {
    fetcher: async () =>
      Response.json({
        errors: { access: 'Free plans do not have access to this endpoint. fake-private-value' },
        response: [],
      }),
  });
  await assert.rejects(
    f.service.loadBookmakers(randomUUID(), f.actor),
    /refuse l’accès à cet endpoint/,
  );
  const restarted = manualFootball({ db: f.db, config: f.config });
  assert.match(restarted.usage().lastError, /abonnement/);
  assert.equal(restarted.usage().lastError.includes('fake-private-value'), false);
  assert.equal(restarted.bookmakers().length, 0);
  assert.equal(f.requests.length, 1);
});

test('missing 1X2 prices do not publish a match or request another bookmaker', async (t) => {
  const f = setup(t);
  await f.service.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor);
  f.advance();
  await assert.rejects(
    f.service.importOdds({ fixtureId: 1234, bookmakerId: 99 }, randomUUID(), f.actor),
    /indisponibles/,
  );
  assert.equal(f.requests.length, 2);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
});

test('finished fixtures and cancelled published matches cannot be reopened by an import', async (t) => {
  const f = setup(t);
  await f.service.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor);
  f.advance();
  const imported = await f.service.importOdds(
    { fixtureId: 1234, bookmakerId: 55 },
    randomUUID(),
    f.actor,
  );
  f.db.prepare("UPDATE matches SET status='CANCELLED' WHERE id=?").run(imported.matchId);
  await assert.rejects(
    f.service.importOdds({ fixtureId: 1234, bookmakerId: 55 }, randomUUID(), f.actor),
    /plus être modifié/,
  );
  f.db.prepare("UPDATE football_fixtures SET status='FT'").run();
  await assert.rejects(
    f.service.importOdds({ fixtureId: 1234, bookmakerId: 55 }, randomUUID(), f.actor),
    /future/,
  );
  assert.equal(f.requests.length, 2);
});

test('existing stakes keep their quote and identity conflicts are rejected before any provider call', async (t) => {
  const f = setup(t);
  await f.service.loadFixtures({ date: '2026-11-04' }, randomUUID(), f.actor);
  f.advance();
  const imported = await f.service.importOdds(
    { fixtureId: 1234, bookmakerId: 55 },
    randomUUID(),
    f.actor,
  );
  transaction(f.db, () => movement(f.db, f.actor, 500, 'CREDIT', 'TEST', randomUUID()));
  const bet = placeBet(
    f.db,
    f.actor,
    { matchId: imported.matchId, betType: 'HOME', amount: 100 },
    randomUUID(),
  );
  await f.service.importOdds({ fixtureId: 1234, bookmakerId: 55 }, randomUUID(), f.actor);
  assert.equal(f.db.prepare('SELECT odds FROM bets WHERE id=?').get(bet.id).odds, 180);
  f.db.prepare("UPDATE football_fixtures SET homeTeam='Changed FC'").run();
  // Use a different bookmaker, for which no odds cache exists.
  f.advance();
  await assert.rejects(
    f.service.importOdds({ fixtureId: 1234, bookmakerId: 99 }, randomUUID(), f.actor),
    /verrouillées/,
  );
  assert.equal(f.requests.length, 2);
  assert.equal(
    f.db.prepare('SELECT homeTeam FROM matches WHERE id=?').get(imported.matchId).homeTeam,
    'Home FC',
  );
});

test('closing and reopening the SQLite file preserves cached responses and spent quota', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'betverse-football-'));
  const path = join(directory, 'test.sqlite');
  let db = openDatabase(path);
  t.after(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const actor = createUser(db, {
    email: 'admin@example.test',
    username: 'admin',
    passwordHash: 'unused',
    role: 'ADMIN',
  });
  let calls = 0;
  const config = {
    footballMode: 'manual',
    footballKey: 'fake',
    footballDailyLimit: 10,
    footballFetch: async () => {
      calls++;
      return Response.json({ errors: [], response: [] });
    },
  };
  await manualFootball({ db, config }).loadFixtures({ date: '2026-11-04' }, randomUUID(), actor.id);
  db.close();
  db = openDatabase(path);
  const restarted = manualFootball({ db, config });
  assert.equal(
    (await restarted.loadFixtures({ date: '2026-11-04' }, randomUUID(), actor.id)).cached,
    true,
  );
  assert.equal(restarted.usage().used, 1);
  assert.equal(calls, 1);
});
