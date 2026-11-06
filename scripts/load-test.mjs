// Disposable loopback fixture; never accepts an external URL or a real database.
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { openDatabase } from '../server/db/database.mjs';
import { configFromEnv } from '../server/lib/config.mjs';
import { hashPassword, digest, secret } from '../server/lib/security.mjs';
import { createUser, now } from '../server/domain/accounts.mjs';
import { transaction } from '../server/lib/errors.mjs';
if (process.env.NODE_ENV === 'production') throw Error('Fixture interdite en production.');
const directory = await mkdtemp(join(tmpdir(), 'betverse-load-'));
const db = openDatabase(join(directory, 'load.sqlite'));
let server;
try {
  const config = { ...configFromEnv({}), test: true, staticDir: directory };
  const passwordHash = await hashPassword('DisposableLoadTest123'),
    users = [];
  transaction(db, () => {
    for (let index = 0; index < 1000; index++) {
      const user = createUser(db, {
        username: `load-${index}`,
        email: `load-${index}@example.test`,
        passwordHash,
      });
      const cookie = secret(),
        csrf = secret();
      db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
        digest(cookie),
        user.id,
        csrf,
        Date.now() + 3600000,
      );
      users.push({ ...user, cookie, csrf, key: randomUUID() });
    }
  });
  const matchId = randomUUID();
  db.prepare(
    'INSERT INTO matches(id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,competition,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    matchId,
    'Load Home',
    'Load Away',
    new Date(Date.now() + 3600000).toISOString(),
    180,
    240,
    310,
    'Synthetic QA',
    now(),
  );
  const app = await createApp({ db, config });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`,
    latencies = [],
    statuses = {};
  const request = async (user, path, body, key) => {
    const began = performance.now();
    const response = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: config.origin,
        'X-Requested-With': 'BetVerse',
        Cookie: `${config.cookieName}=${user.cookie}`,
        'X-CSRF-Token': user.csrf,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    await response.arrayBuffer();
    latencies.push(performance.now() - began);
    statuses[response.status] = (statuses[response.status] || 0) + 1;
    return response.status;
  };
  async function phase(action) {
    let index = 0;
    await Promise.all(
      Array.from({ length: 25 }, async () => {
        while (index < users.length) {
          const user = users[index++];
          await action(user);
        }
      }),
    );
  }
  const began = performance.now();
  await phase(async (user) => {
    assert.equal(await request(user, '/api/wallet'), 200);
    assert.equal(await request(user, '/api/matches?status=UPCOMING'), 200);
  });
  await phase(async (user) => {
    assert.equal(await request(user, '/api/wallet/claim', {}), 200);
    assert.equal(await request(user, '/api/wallet/claim', {}), 409);
  });
  await phase(async (user) => {
    const body = { matchId, betType: 'HOME', amount: 100, odds: 1.8 };
    assert.equal(await request(user, '/api/bet', body, user.key), 201);
    assert.equal(await request(user, '/api/bet', body, user.key), 201);
  });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bets').get().n, 1000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM wallets WHERE balance=400').get().n, 1000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM odds_calls').get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  latencies.sort((a, b) => a - b);
  const report = {
    generatedAt: now(),
    environment:
      'Windows local, disposable SQLite WAL, synthetic users, 25 concurrent workers; not a Render capacity benchmark',
    accounts: 1000,
    requests: latencies.length,
    concurrency: 25,
    durationMs: Math.round(performance.now() - began),
    p50Ms: Math.round(latencies[Math.floor(latencies.length * 0.5)]),
    p95Ms: Math.round(latencies[Math.floor(latencies.length * 0.95)]),
    statuses,
    assertions: {
      oneBonusPerUser: true,
      oneStakePerIdempotencyKey: true,
      expectedBalances: true,
      foreignKeys: true,
      sportsProviderCalls: 0,
    },
    rssBytes: process.memoryUsage().rss,
  };
  await mkdir('docs/qa', { recursive: true });
  await writeFile('docs/qa/load-result.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  const target = resolve(directory),
    root = resolve(tmpdir()) + sep;
  if (!target.startsWith(root) || !basename(target).startsWith('betverse-load-'))
    throw Error('Nettoyage hors fixture refusé.');
  await rm(target, { recursive: true, force: true });
}
