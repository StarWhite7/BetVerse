import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../app.mjs';
import { openDatabase } from '../db/database.mjs';
import { configFromEnv } from '../lib/config.mjs';
import { hashPassword } from '../lib/security.mjs';
import { createUser } from '../domain/accounts.mjs';
const credentials = { identifier: 'alice', password: 'StrongPassword123' };
async function fixture(t, { disk = false, mail = false, production = false, football = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'betverse-test-'));
  const mailbox = [];
  const config = {
    ...configFromEnv({}),
    production,
    test: !mail,
    database: disk ? join(directory, 'test.sqlite') : ':memory:',
    mailDir: join(directory, 'mail'),
    staticDir: directory,
    ...football,
    ...(production
      ? {
          cookieName: '__Host-betverse_session',
          mailSender: async (message) => mailbox.push(message),
        }
      : {}),
  };
  const db = openDatabase(config.database);
  const hashed = await hashPassword(credentials.password);
  const alice = createUser(db, {
    email: 'alice@example.test',
    username: 'alice',
    passwordHash: hashed,
  });
  const bob = createUser(db, { email: 'bob@example.test', username: 'bob', passwordHash: hashed });
  const admin = createUser(db, {
    email: 'admin@example.test',
    username: 'admin',
    passwordHash: hashed,
    role: 'ADMIN',
  });
  const app = await createApp({ db, config });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, { method = 'GET', body, session, headers = {} } = {}) => {
    const response = await fetch(url + path, {
      method,
      headers: {
        Origin: config.origin,
        'X-Requested-With': 'BetVerse',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  };
  const login = async (identifier = 'alice') => {
    const response = await request('/auth/login', {
      method: 'POST',
      body: { ...credentials, identifier },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return {
      cookie: response.headers.get('set-cookie').split(';')[0],
      csrf: response.body.csrfToken,
      user: response.body.user,
    };
  };
  const aliceSession = await login(),
    adminSession = await login('admin');
  const makeMatch = async (overrides = {}) => {
    const response = await request('/matches', {
      method: 'POST',
      session: adminSession,
      body: {
        homeTeam: 'Home FC',
        awayTeam: 'Away FC',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        oddsHome: 1.8,
        oddsAway: 2.4,
        oddsDraw: 3.1,
        ...overrides,
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body;
  };
  const bet = async (match, amount = 100, extras = {}) =>
    request('/bet', {
      method: 'POST',
      session: aliceSession,
      body: { matchId: match.id, betType: 'HOME', amount, ...extras },
      headers: { 'Idempotency-Key': randomUUID() },
    });
  const claim = () => request('/wallet/claim', { method: 'POST', session: aliceSession, body: {} });
  return {
    db,
    config,
    request,
    login,
    alice,
    bob,
    admin,
    aliceSession,
    adminSession,
    makeMatch,
    bet,
    claim,
    directory,
    mailbox,
  };
}
test('register validates password, refuses role injection and duplicate identities', async (t) => {
  const { request } = await fixture(t);
  assert.equal(
    (
      await request('/auth/register', {
        method: 'POST',
        body: { email: 'c@example.test', username: 'charlie', password: 'weak' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/auth/register', {
        method: 'POST',
        body: {
          email: 'c@example.test',
          username: 'charlie',
          password: credentials.password,
          role: 'ADMIN',
        },
      })
    ).status,
    400,
  );
  const result = await request('/auth/register', {
    method: 'POST',
    body: { email: 'c@example.test', username: 'charlie', password: credentials.password },
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.role, 'USER');
  assert.ok(!('passwordHash' in result.body));
  assert.equal(
    (
      await request('/auth/register', {
        method: 'POST',
        body: { email: 'c@example.test', username: 'charlie', password: credentials.password },
      })
    ).status,
    409,
  );
});
test('cookie sessions are opaque HttpOnly, revoked at logout, expired sessions fail', async (t) => {
  const f = await fixture(t);
  const login = await f.request('/auth/login', { method: 'POST', body: credentials });
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
  assert.ok(!('access_token' in login.body));
  assert.equal(
    (
      await f.request('/auth/login', {
        method: 'POST',
        body: { ...credentials, password: 'wrong' },
      })
    ).status,
    401,
  );
  assert.equal((await f.request('/auth/me', { session: f.aliceSession })).status, 200);
  assert.equal(
    (await f.request('/auth/logout', { method: 'POST', session: f.aliceSession, body: {} })).status,
    200,
  );
  assert.equal((await f.request('/auth/me', { session: f.aliceSession })).status, 401);
  f.db.prepare('UPDATE sessions SET expiresAt=0').run();
  assert.equal((await f.request('/wallet', { session: f.adminSession })).status, 401);
});
test('CSRF, origin, unauthorized and admin restrictions are enforced', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/wallet')).status, 401);
  assert.equal(
    (
      await f.request('/wallet/claim', {
        method: 'POST',
        session: f.aliceSession,
        body: {},
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/wallet/claim', {
        method: 'POST',
        session: f.aliceSession,
        body: {},
        headers: { 'X-CSRF-Token': 'wrong' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/wallet/credit', {
        method: 'POST',
        session: f.aliceSession,
        body: { amount: 100 },
      })
    ).status,
    403,
  );
  assert.equal((await f.request('/users', { session: f.aliceSession })).status, 403);
  assert.equal(
    (await f.request('/matches', { method: 'POST', session: f.aliceSession, body: {} })).status,
    403,
  );
  assert.equal(
    (
      await f.request('/users/me', {
        method: 'PATCH',
        session: f.aliceSession,
        body: { username: 'alice', role: 'ADMIN' },
      })
    ).status,
    400,
  );
});
test('daily bonus remains unique under simultaneous requests', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.claim()));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.balance, 500);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM ledger WHERE reason='DAILY_REWARD'").get().n,
    1,
  );
});
test('server quote wins, stale quotes and invalid stakes do not debit', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  for (const amount of [0, -1, 1.5, 1000001])
    assert.equal((await f.bet(match, amount)).status, 400);
  assert.equal((await f.bet(match, 100, { odds: 999 })).status, 409);
  assert.equal((await f.bet(match, 501)).status, 409);
  const result = await f.bet(match, 100);
  assert.equal(result.status, 201);
  assert.equal(result.body.odds, 1.8);
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.balance, 400);
});
test('idempotency retries debit once and payload collisions are rejected', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch(),
    key = randomUUID();
  const request = (amount) =>
    f.request('/bet', {
      method: 'POST',
      session: f.aliceSession,
      body: { matchId: match.id, betType: 'HOME', amount },
      headers: { 'Idempotency-Key': key },
    });
  const [a, b] = await Promise.all([request(100), request(100)]);
  assert.equal(a.body.id, b.body.id);
  assert.equal((await request(200)).status, 409);
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.balance, 400);
});
test('concurrent stakes cannot overdraw a wallet', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  const results = await Promise.all([f.bet(match, 400), f.bet(match, 400)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.balance, 100);
});
test('kickoff blocks new stakes and future settlements', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  const finish = () =>
    f.request(`/matches/${match.id}/finish`, {
      method: 'POST',
      session: f.adminSession,
      body: { result: 'HOME', homeScore: 2, awayScore: 1 },
    });
  assert.equal((await finish()).status, 409);
  f.db
    .prepare('UPDATE matches SET startDate=? WHERE id=?')
    .run(new Date(Date.now() - 1000).toISOString(), match.id);
  assert.equal((await f.bet(match)).status, 409);
  assert.equal((await finish()).status, 200);
});
test('match settlement pays exactly once, conflicting outcomes fail, loss remains unpaid', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  await f.bet(match, 100);
  await f.bet(match, 100, { betType: 'AWAY' });
  f.db
    .prepare('UPDATE matches SET startDate=? WHERE id=?')
    .run(new Date(Date.now() - 1000).toISOString(), match.id);
  const finish = (body) =>
    f.request(`/matches/${match.id}/finish`, { method: 'POST', session: f.adminSession, body });
  assert.equal((await finish({ result: 'HOME', homeScore: 0, awayScore: 2 })).status, 400);
  const results = await Promise.all([
    finish({ result: 'HOME', homeScore: 2, awayScore: 1 }),
    finish({ result: 'HOME', homeScore: 2, awayScore: 1 }),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.balance, 480);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger WHERE reason='BET_PAYOUT'").get().n, 1);
  assert.equal((await finish({ result: 'AWAY', homeScore: 1, awayScore: 2 })).status, 409);
  assert.deepEqual(
    f.db
      .prepare('SELECT status FROM bets ORDER BY betType')
      .all()
      .map((x) => x.status),
    ['LOST', 'WON'],
  );
});
test('failed payout rolls the whole settlement back', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  await f.bet(match);
  f.db.prepare('UPDATE wallets SET balance=1000000000000 WHERE userId=?').run(f.alice.id);
  f.db
    .prepare('UPDATE matches SET startDate=? WHERE id=?')
    .run(new Date(Date.now() - 1000).toISOString(), match.id);
  assert.equal(
    (
      await f.request(`/matches/${match.id}/finish`, {
        method: 'POST',
        session: f.adminSession,
        body: { result: 'HOME', homeScore: 1, awayScore: 0 },
      })
    ).status,
    409,
  );
  assert.equal(
    f.db.prepare('SELECT status FROM matches WHERE id=?').get(match.id).status,
    'UPCOMING',
  );
  assert.equal(f.db.prepare('SELECT status FROM bets').get().status, 'PENDING');
});
test('match editing preserves accepted stakes and only future matches may change', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  await f.bet(match);
  const patch = (body) =>
    f.request(`/matches/${match.id}`, { method: 'PATCH', session: f.adminSession, body });
  assert.equal((await patch({ oddsHome: 2.1 })).status, 200);
  assert.equal((await patch({ homeTeam: 'Different FC' })).status, 409);
  assert.equal(f.db.prepare('SELECT odds FROM bets').get().odds, 180);
});
test('stats cover full history, private bets stay private, page total is correct', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  for (let i = 0; i < 7; i++) await f.bet(match, 10);
  const stats = await f.request('/users/me/stats', { session: f.aliceSession });
  assert.equal(stats.body.betsPlayed, 7);
  assert.equal(stats.body.versePending, 70);
  const page = await f.request('/bet/my-bets?limit=3&skip=3', { session: f.aliceSession });
  assert.equal(page.body.length, 3);
  assert.equal(page.headers.get('x-total-count'), '7');
  const bob = await f.login('bob');
  assert.equal((await f.request('/bet/my-bets', { session: bob })).body.length, 0);
  assert.equal((await f.request('/bet/admin-bets', { session: f.adminSession })).body.length, 7);
});
test('leaderboard ranks win rate, not win count; XP ties and email privacy', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  await f.bet(match, 10);
  await f.bet(match, 10, { betType: 'AWAY' });
  const bob = await f.login('bob');
  await f.request('/wallet/claim', { method: 'POST', session: bob, body: {} });
  await f.request('/bet', {
    method: 'POST',
    session: bob,
    body: { matchId: match.id, betType: 'HOME', amount: 10 },
    headers: { 'Idempotency-Key': randomUUID() },
  });
  f.db
    .prepare('UPDATE matches SET startDate=? WHERE id=?')
    .run(new Date(Date.now() - 1000).toISOString(), match.id);
  await f.request(`/matches/${match.id}/finish`, {
    method: 'POST',
    session: f.adminSession,
    body: { result: 'HOME', homeScore: 1, awayScore: 0 },
  });
  const result = await f.request('/leaderboard?metric=wins', { session: f.aliceSession });
  assert.equal(result.body[0].username, 'bob');
  assert.equal(result.body[0].winRate, 100);
  assert.equal(result.body[0].currentStreak, 1);
  assert.ok(result.body.every((row) => !('email' in row) && !('passwordHash' in row)));
});
test('agencies charge shards once, invitations are scoped, leadership transfer is atomic', async (t) => {
  const f = await fixture(t);
  const agency = await f.request('/agence', {
    method: 'POST',
    session: f.aliceSession,
    body: { name: 'Nova Team' },
  });
  assert.equal(agency.status, 201);
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.shards, 0);
  assert.equal(
    (
      await f.request('/agence', {
        method: 'POST',
        session: f.aliceSession,
        body: { name: 'Second Team' },
      })
    ).status,
    409,
  );
  const invite = await f.request('/agence/invitations', {
    method: 'POST',
    session: f.aliceSession,
    body: { username: 'bob' },
  });
  assert.equal(invite.status, 201);
  assert.equal(
    (
      await f.request(`/agence/invitations/${invite.body.id}/accept`, {
        method: 'POST',
        session: f.adminSession,
        body: {},
      })
    ).status,
    409,
  );
  const bob = await f.login('bob');
  assert.equal(
    (
      await f.request(`/agence/invitations/${invite.body.id}/accept`, {
        method: 'POST',
        session: bob,
        body: {},
      })
    ).status,
    200,
  );
  const roles = (changes) =>
    f.request('/agence/members/roles', {
      method: 'PATCH',
      session: f.aliceSession,
      body: { changes },
    });
  assert.equal((await roles([{ id: f.alice.id, role: 'MEMBRE' }])).status, 400);
  assert.equal(
    (
      await roles([
        { id: f.alice.id, role: 'ASSOCIE' },
        { id: f.bob.id, role: 'DIRECTEUR' },
      ])
    ).status,
    200,
  );
  assert.equal(
    (await f.request('/agence', { method: 'DELETE', session: f.aliceSession, body: {} })).status,
    403,
  );
  assert.equal(
    (await f.request('/agence/leave', { method: 'POST', session: bob, body: {} })).status,
    409,
  );
});
test('agency prediction cutoff and score settlement persist', async (t) => {
  const f = await fixture(t);
  await f.request('/agence', {
    method: 'POST',
    session: f.aliceSession,
    body: { name: 'Nova Team' },
  });
  const match = await f.makeMatch();
  const vote = () =>
    f.request('/agence/match-votes', {
      method: 'POST',
      session: f.aliceSession,
      body: { votes: [{ matchId: match.id, homeScore: 2, awayScore: 1 }] },
    });
  assert.equal((await vote()).status, 200);
  f.db
    .prepare('UPDATE matches SET startDate=? WHERE id=?')
    .run(new Date(Date.now() - 1000).toISOString(), match.id);
  assert.equal((await vote()).status, 409);
  await f.request(`/matches/${match.id}/finish`, {
    method: 'POST',
    session: f.adminSession,
    body: { result: 'HOME', homeScore: 2, awayScore: 1 },
  });
  const agency = (await f.request('/agence/me', { session: f.aliceSession })).body;
  assert.equal(agency.clanScore, 3);
  assert.equal(agency.xp, 300);
  assert.equal(agency.trophiesCount, 1);
  assert.equal(
    (await f.request('/agence/coordination', { session: f.aliceSession })).body.stats.activeStreak,
    1,
  );
});
test('notifications cannot be read across users', async (t) => {
  const f = await fixture(t);
  await f.request('/agence', {
    method: 'POST',
    session: f.aliceSession,
    body: { name: 'Nova Team' },
  });
  await f.request('/agence/invitations', {
    method: 'POST',
    session: f.aliceSession,
    body: { username: 'bob' },
  });
  const bob = await f.login('bob');
  const notes = (await f.request('/notifications', { session: bob })).body;
  assert.equal(
    (
      await f.request(`/notifications/${notes[0].id}/read`, {
        method: 'PATCH',
        session: f.aliceSession,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal((await f.request('/notifications/unread-count', { session: bob })).body, 1);
});
test('password change invalidates all sessions and enforces common policy', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request('/users/me/password', {
        method: 'PATCH',
        session: f.aliceSession,
        body: { currentPassword: credentials.password, newPassword: 'weak' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request('/users/me/password', {
        method: 'PATCH',
        session: f.aliceSession,
        body: { currentPassword: credentials.password, newPassword: 'AnotherStrong123' },
      })
    ).status,
    200,
  );
  assert.equal((await f.request('/auth/me', { session: f.aliceSession })).status, 401);
});
test('reset mail is local in development, token single use, sessions revoked', async (t) => {
  const f = await fixture(t, { mail: true });
  const result = await f.request('/auth/forgot-password', {
    method: 'POST',
    body: { identifier: 'alice' },
  });
  assert.equal(result.status, 200);
  const unknown = await f.request('/auth/forgot-password', {
    method: 'POST',
    body: { identifier: 'unknown' },
  });
  assert.equal(result.body.message, unknown.body.message);
  const mail = JSON.parse(
    await readFile(join(f.config.mailDir, (await readdir(f.config.mailDir))[0]), 'utf8'),
  );
  const token = new URL(mail.text.split(' : ')[1]).searchParams.get('token');
  const reset = () =>
    f.request('/auth/reset-password', {
      method: 'POST',
      body: { token, password: 'ResetPassword123' },
    });
  assert.equal((await reset()).status, 200);
  assert.equal((await reset()).status, 400);
  assert.equal((await f.request('/auth/me', { session: f.aliceSession })).status, 401);
});
test('data survives reopening database and production config fails closed', async (t) => {
  const f = await fixture(t, { disk: true });
  await f.claim();
  const second = openDatabase(f.config.database);
  assert.equal(
    second.prepare('SELECT balance FROM wallets WHERE userId=?').get(f.alice.id).balance,
    500,
  );
  second.close();
  assert.throws(() => configFromEnv({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' }));
  assert.throws(() => configFromEnv({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.com' }));
  assert.equal(
    configFromEnv({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://example.com',
      SMTP_URL: 'smtps://mail.example.com',
      MAIL_FROM: 'noreply@example.com',
    }).cookieName,
    '__Host-betverse_session',
  );
});
test('production registration requires a single-use email confirmation before login', async (t) => {
  const f = await fixture(t, { production: true });
  const body = {
    email: 'charlie@example.test',
    username: 'charlie',
    password: credentials.password,
  };
  const registered = await f.request('/auth/register', { method: 'POST', body });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.requiresVerification, true);
  const login = () =>
    f.request('/auth/login', {
      method: 'POST',
      body: { identifier: 'charlie', password: credentials.password },
    });
  assert.equal((await login()).status, 403);
  assert.equal(f.mailbox.length, 1);
  const token = new URL(f.mailbox[0].text.split(' : ')[1]).searchParams.get('token');
  assert.notEqual(f.db.prepare('SELECT tokenHash FROM email_verifications').get().tokenHash, token);
  const verify = () => f.request('/auth/verify-email', { method: 'POST', body: { token } });
  assert.equal((await verify()).status, 200);
  assert.equal((await verify()).status, 400);
  const logged = await login();
  assert.equal(logged.status, 200);
  assert.match(logged.headers.get('set-cookie'), /Secure/);
  assert.match(logged.headers.get('set-cookie'), /__Host-/);
});
test('admin wallet adjustments and transfers are atomic and replay safe', async (t) => {
  const f = await fixture(t);
  const creditKey = randomUUID(),
    transferKey = randomUUID();
  const credit = () =>
    f.request('/wallet/credit', {
      method: 'POST',
      session: f.adminSession,
      body: { amount: 200 },
      headers: { 'Idempotency-Key': creditKey },
    });
  assert.equal((await credit()).status, 200);
  assert.equal((await credit()).body.balance, 200);
  const transfer = (amount) =>
    f.request('/wallet/transfer', {
      method: 'POST',
      session: f.adminSession,
      body: { username: 'bob', amount },
      headers: { 'Idempotency-Key': transferKey },
    });
  assert.equal((await transfer(100)).body.balance, 100);
  assert.equal((await transfer(100)).body.balance, 100);
  assert.equal((await transfer(101)).status, 409);
  assert.equal(
    f.db.prepare('SELECT balance FROM wallets WHERE userId=?').get(f.bob.id).balance,
    100,
  );
  const failed = await f.request('/wallet/transfer', {
    method: 'POST',
    session: f.adminSession,
    body: { username: 'bob', amount: 200 },
    headers: { 'Idempotency-Key': randomUUID() },
  });
  assert.equal(failed.status, 409);
  assert.equal(
    f.db.prepare('SELECT balance FROM wallets WHERE userId=?').get(f.bob.id).balance,
    100,
  );
});
test('cancelled matches refund every stake exactly once and never count as a loss', async (t) => {
  const f = await fixture(t);
  await f.claim();
  const match = await f.makeMatch();
  await f.bet(match, 100);
  const cancel = () =>
    f.request(`/matches/${match.id}/cancel`, {
      method: 'POST',
      session: f.adminSession,
      body: { reason: 'Rencontre reportée par les organisateurs' },
    });
  assert.equal(
    (
      await f.request(`/matches/${match.id}/cancel`, {
        method: 'POST',
        session: f.aliceSession,
        body: { reason: 'Tentative non autorisée' },
      })
    ).status,
    403,
  );
  const [one, two] = await Promise.all([cancel(), cancel()]);
  assert.equal(one.status, 200);
  assert.equal(two.status, 200);
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.balance, 500);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger WHERE reason='BET_REFUND'").get().n, 1);
  assert.equal(
    (await f.request('/bet/my-bets?status=VOID', { session: f.aliceSession })).body.length,
    1,
  );
  assert.equal((await f.request('/users/me/stats', { session: f.aliceSession })).body.winRate, 0);
  assert.equal(
    (await f.request('/users/me/stats', { session: f.aliceSession })).body.versePending,
    0,
  );
  assert.equal((await f.bet(match, 100)).status, 409);
  assert.equal(
    (
      await f.request(`/matches/${match.id}/finish`, {
        method: 'POST',
        session: f.adminSession,
        body: { result: 'HOME', homeScore: 1, awayScore: 0 },
      })
    ).status,
    409,
  );
});
test('started matches appear live and preserve the database foreign keys', async (t) => {
  const f = await fixture(t);
  const match = await f.makeMatch();
  f.db
    .prepare('UPDATE matches SET startDate=? WHERE id=?')
    .run(new Date(Date.now() - 1000).toISOString(), match.id);
  assert.equal(
    (await f.request('/matches?status=LIVE', { session: f.aliceSession })).body[0].id,
    match.id,
  );
  assert.equal(
    (await f.request('/matches?status=UPCOMING', { session: f.aliceSession })).body.length,
    0,
  );
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(f.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('startup, health, admin reads and unauthorized actions never call API Football', async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    football: {
      footballMode: 'manual',
      footballKey: 'fake-test-only-key',
      footballDailyLimit: 10,
      footballFetch: async () => {
        calls++;
        return Response.json({ errors: [], response: [] });
      },
    },
  });
  assert.equal(calls, 0);
  assert.equal((await f.request('/health')).status, 200);
  assert.equal((await f.request('/matches', { session: f.aliceSession })).status, 200);
  assert.equal(
    (await f.request('/admin/football', { session: f.adminSession })).body.usage.mode,
    'manual',
  );
  assert.equal((await f.request('/admin/football', { session: f.aliceSession })).status, 403);
  const action = {
    method: 'POST',
    body: { date: '2026-11-04' },
    headers: { 'Idempotency-Key': randomUUID() },
  };
  assert.equal((await f.request('/admin/football/fixtures', action)).status, 401);
  assert.equal(
    (await f.request('/admin/football/fixtures', { ...action, session: f.aliceSession })).status,
    403,
  );
  assert.equal(
    (
      await f.request('/admin/football/fixtures', {
        ...action,
        session: f.adminSession,
        headers: {
          ...action.headers,
          'X-CSRF-Token': 'invalid',
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/admin/football/fixtures', {
        ...action,
        session: f.adminSession,
        body: { date: 'invalid' },
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await f.request('/admin/football/fixtures', { ...action, session: f.adminSession })).status,
    200,
  );
  assert.equal(calls, 1);
});
