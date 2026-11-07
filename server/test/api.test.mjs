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
import { totp } from '../lib/totp.mjs';
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

test('The Odds API routes enforce admin, CSRF, consent and schema before any provider call', async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    football: {
      oddsMode: 'manual',
      oddsKey: 'fake-only',
      oddsDailyLimit: 10,
      oddsMonthlyLimit: 400,
      oddsFetch: async () => {
        calls++;
        return Response.json([]);
      },
    },
  });
  assert.equal(calls, 0);
  const read = await f.request('/admin/odds', { session: f.adminSession });
  assert.equal(read.status, 200);
  assert.equal(read.body.usage.configured, true);
  assert.equal(JSON.stringify(read.body).includes('fake-only'), false);
  assert.equal((await f.request('/health')).status, 200);
  assert.equal((await f.request('/matches', { session: f.aliceSession })).status, 200);
  assert.equal((await f.request('/admin/odds', { session: f.aliceSession })).status, 403);
  const action = {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: {
      competition: 'soccer_france_ligue_one',
      date: new Date().toISOString().slice(0, 10),
      consent: true,
    },
  };
  assert.equal((await f.request('/admin/odds/preview', action)).status, 401);
  assert.equal(
    (await f.request('/admin/odds/preview', { ...action, session: f.aliceSession })).status,
    403,
  );
  assert.equal(
    (
      await f.request('/admin/odds/preview', {
        ...action,
        session: f.adminSession,
        headers: { ...action.headers, 'X-CSRF-Token': 'invalid' },
      })
    ).status,
    403,
  );
  for (const body of [
    { ...action.body, consent: false },
    { ...action.body, competition: '../evil' },
    { ...action.body, apiKey: 'injected' },
  ])
    assert.equal(
      (await f.request('/admin/odds/preview', { ...action, session: f.adminSession, body })).status,
      400,
    );
  assert.equal(
    (await f.request('/admin/odds/publish', { method: 'POST', session: f.aliceSession, body: {} }))
      .status,
    403,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await f.request('/admin/odds/preview', { ...action, session: f.adminSession })).status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await f.request('/admin/odds/preview', { ...action, session: f.adminSession })).body.cached,
    true,
  );
  assert.equal(calls, 1);
});

test('grouped preview and publication enforce authorization, expose changes and update the player catalogue together', async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    football: {
      oddsMode: 'manual',
      oddsKey: 'fake-only',
      oddsDailyLimit: 10,
      oddsMonthlyLimit: 400,
      oddsFetch: async (url) => {
        calls++;
        const sport = new URL(url).pathname.split('/')[3],
          home = `Home ${sport}`;
        return Response.json([
          {
            id: sport,
            sport_key: sport,
            home_team: home,
            away_team: 'Away FC',
            commence_time: new Date(Date.now() + 86400000).toISOString(),
            bookmakers: [
              {
                key: 'winamax_fr',
                last_update: new Date().toISOString(),
                markets: [
                  {
                    key: 'h2h',
                    outcomes: [
                      { name: home, price: 1.8 },
                      { name: 'Draw', price: 3.1 },
                      { name: 'Away FC', price: 2.4 },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      },
    },
  });
  const action = {
    method: 'POST',
    session: f.adminSession,
    headers: { 'Idempotency-Key': randomUUID() },
    body: {
      competitions: ['soccer_france_ligue_one', 'soccer_epl'],
      date: new Date().toISOString().slice(0, 10),
      consent: true,
    },
  };
  assert.equal(
    (await f.request('/admin/odds/preview-batch', { ...action, session: f.aliceSession })).status,
    403,
  );
  assert.equal(
    (
      await f.request('/admin/odds/preview-batch', {
        ...action,
        headers: { ...action.headers, 'X-CSRF-Token': 'bad' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/admin/odds/preview-batch', {
        ...action,
        body: { ...action.body, competitions: ['soccer_epl', 'soccer_epl'] },
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
  const preview = await f.request('/admin/odds/preview-batch', action);
  assert.equal(preview.status, 200);
  assert.equal(calls, 2);
  assert.ok(preview.body.fixtures.every((row) => row.current === null));
  const fixtures = preview.body.fixtures.map((row) => ({
    eventId: row.externalId,
    snapshotId: row.snapshotId,
    bookmaker: 'winamax_fr',
  }));
  const publish = { method: 'POST', session: f.adminSession, body: { fixtures } };
  assert.equal(
    (await f.request('/admin/odds/publish-batch', { ...publish, session: f.aliceSession })).status,
    403,
  );
  assert.equal(
    (
      await f.request('/admin/odds/publish-batch', {
        ...publish,
        body: { fixtures: [fixtures[0], { ...fixtures[1], snapshotId: randomUUID() }] },
      })
    ).status,
    409,
  );
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
  const result = await f.request('/admin/odds/publish-batch', publish);
  assert.equal(result.status, 200);
  assert.equal(result.body.publishedCount, 2);
  assert.ok(result.body.fixtures.every((row) => row.current.home === 180));
  assert.equal(
    (await f.request('/matches?status=UPCOMING', { session: f.aliceSession })).body.length,
    2,
  );
  assert.equal((await f.request('/admin/odds/preview-batch', action)).status, 200);
  assert.equal(calls, 2);
});

test('combined API uses authoritative leg quotes, one debit and protects non-leading fixtures', async (t) => {
  const f = await fixture(t);
  const first = await f.makeMatch(),
    second = await f.makeMatch({ homeTeam: 'Second FC' });
  await f.request('/wallet/claim', { method: 'POST', session: f.aliceSession, body: {} });
  const body = {
    amount: 100,
    selections: [first, second].map((match) => ({
      matchId: match.id,
      betType: 'HOME',
      odds: match.oddsHome,
    })),
  };
  const action = {
    method: 'POST',
    session: f.aliceSession,
    headers: { 'Idempotency-Key': randomUUID() },
    body,
  };
  assert.equal(
    (
      await f.request('/bet/combined', {
        ...action,
        body: { ...body, selections: [body.selections[0], body.selections[0]] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request('/bet/combined', {
        ...action,
        body: { ...body, selections: [body.selections[0], { ...body.selections[1], odds: 9 }] },
      })
    ).status,
    409,
  );
  const result = await f.request('/bet/combined', action);
  assert.equal(result.status, 201);
  assert.equal(result.body.selections.length, 2);
  assert.equal((await f.request('/bet/combined', action)).body.id, result.body.id);
  assert.equal((await f.request('/wallet', { session: f.aliceSession })).body.balance, 400);
  const history = await f.request('/bet/my-bets', { session: f.aliceSession });
  assert.equal(history.body[0].kind, 'COMBO');
  assert.equal(history.body[0].selections.length, 2);
  assert.equal(
    (
      await f.request(`/matches/${second.id}`, {
        method: 'PATCH',
        session: f.adminSession,
        body: { homeTeam: 'Changed FC' },
      })
    ).status,
    409,
  );
});

test('account export excludes credentials and deletion erases the account without clearing cookies on a wrong password', async (t) => {
  const f = await fixture(t);
  await f.request('/wallet/claim', { method: 'POST', session: f.aliceSession, body: {} });
  const match = await f.makeMatch();
  await f.bet(match);
  const exported = await f.request('/users/me/export', { session: f.aliceSession });
  assert.equal(exported.status, 200);
  assert.equal(exported.body.account.id, f.alice.id);
  assert.equal(JSON.stringify(exported.body).includes('passwordHash'), false);
  const wrong = await f.request('/users/me', {
    method: 'DELETE',
    session: f.aliceSession,
    body: { password: 'wrong', confirmation: 'SUPPRIMER' },
  });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.headers.get('set-cookie'), null);
  const erased = await f.request('/users/me', {
    method: 'DELETE',
    session: f.aliceSession,
    body: { password: credentials.password, confirmation: 'SUPPRIMER' },
  });
  assert.equal(erased.status, 200);
  assert.equal(f.db.prepare('SELECT 1 FROM users WHERE id=?').get(f.alice.id), undefined);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bets WHERE userId=?').get(f.alice.id).n, 0);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal((await f.request('/auth/me', { session: f.aliceSession })).status, 401);
  assert.equal(
    (
      await f.request('/users/me', {
        method: 'DELETE',
        session: f.adminSession,
        body: { password: credentials.password, confirmation: 'SUPPRIMER' },
      })
    ).status,
    409,
  );
});
test('suspension revokes sessions and blocks login; notification preferences are scoped', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request(`/users/${f.bob.id}/status`, {
        method: 'PATCH',
        session: f.aliceSession,
        body: { status: 'SUSPENDED', reason: 'Motif de test explicite' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(`/users/${f.alice.id}/status`, {
        method: 'PATCH',
        session: f.adminSession,
        body: { status: 'SUSPENDED', reason: 'Motif de test explicite' },
      })
    ).status,
    200,
  );
  assert.equal((await f.request('/auth/me', { session: f.aliceSession })).status, 401);
  assert.equal((await f.request('/auth/login', { method: 'POST', body: credentials })).status, 403);
  assert.equal(
    (
      await f.request('/notifications/preferences', {
        method: 'PATCH',
        session: f.adminSession,
        body: { bets: false, agencies: true, push: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request('/notifications/preferences', { session: f.adminSession })).body.bets,
    false,
  );
});
test('admin TOTP grants are scoped to a tab and login, last past thirty minutes and revoke on logout', async (t) => {
  const f = await fixture(t, { football: { adminMfaKey: 'ab'.repeat(32) } });
  const setup = await f.request('/admin/security/setup', {
    method: 'POST',
    session: f.adminSession,
    body: { password: credentials.password },
  });
  assert.equal(setup.status, 200);
  assert.ok(setup.body.secret);
  const { decryptSecret } = await import('../lib/totp.mjs');
  const seed = decryptSecret(
    f.db.prepare('SELECT pendingCipher FROM admin_mfa WHERE userId=?').get(f.admin.id)
      .pendingCipher,
    'ab'.repeat(32),
  );
  const verified = await f.request('/admin/security/verify', {
    method: 'POST',
    session: f.adminSession,
    body: { code: totp(seed), setup: true },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.recoveryCodes.length, 8);
  const tab = {
    session: f.adminSession,
    headers: { 'X-Admin-Tab': verified.body.tabProof },
  };
  const access = (options = tab) => f.request('/admin/odds', options);
  assert.equal((await access()).status, 200);
  assert.equal((await f.request('/admin/security', tab)).body.verified, true);
  const blocked = await access({ session: f.adminSession });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'ADMIN_MFA_REQUIRED');
  const anotherLogin = await f.login('admin');
  assert.equal((await access({ ...tab, session: anotherLogin })).status, 403);
  const actualNow = Date.now;
  const later = t.mock.method(Date, 'now', () => actualNow() + 31 * 60000);
  try {
    assert.equal((await access()).status, 200);
  } finally {
    later.mock.restore();
  }
  assert.equal(
    (
      await f.request('/admin/security/verify', {
        method: 'POST',
        session: f.adminSession,
        body: { code: totp(seed) },
      })
    ).status,
    403,
  );
  const recovered = await f.request('/admin/security/verify', {
    method: 'POST',
    session: f.adminSession,
    body: { code: verified.body.recoveryCodes[0] },
  });
  assert.equal(recovered.status, 200);
  const secondTab = {
    session: f.adminSession,
    headers: { 'X-Admin-Tab': recovered.body.tabProof },
  };
  assert.equal((await access(secondTab)).status, 200);
  assert.equal((await access()).status, 200);
  assert.equal(
    (
      await f.request('/admin/security/verify', {
        method: 'POST',
        session: f.adminSession,
        body: { code: verified.body.recoveryCodes[0] },
      })
    ).status,
    403,
  );
  assert.equal((await f.request('/auth/logout', { ...tab, method: 'POST', body: {} })).status, 200);
  assert.equal((await access()).status, 401);
  assert.equal((await access(secondTab)).status, 401);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM admin_tab_grants').get().n, 0);
});

test('manual result batches preview without provider calls, roll back atomically and replay once', async (t) => {
  const { db, request, makeMatch, bet, claim, adminSession, aliceSession } = await fixture(t);
  const a = await makeMatch(),
    b = await makeMatch({ homeTeam: 'Second FC' });
  await claim();
  assert.equal((await bet(a, 100)).status, 201);
  const past = new Date(Date.now() - 60000).toISOString();
  db.prepare('UPDATE matches SET startDate=? WHERE id IN (?,?)').run(past, a.id, b.id);
  const input = {
    rows: [
      { matchId: a.id, homeScore: 2, awayScore: 0 },
      { matchId: b.id, homeScore: 0, awayScore: 0 },
    ],
  };
  assert.equal(
    (
      await request('/admin/operations/results/preview', {
        method: 'POST',
        session: aliceSession,
        body: input,
      })
    ).status,
    403,
  );
  const preview = await request('/admin/operations/results/preview', {
    method: 'POST',
    session: adminSession,
    body: input,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.providerCredits, 0);
  db.prepare("UPDATE matches SET homeTeam='Changed' WHERE id=?").run(b.id);
  const apply = () =>
    request('/admin/operations/results/apply', {
      method: 'POST',
      session: adminSession,
      body: { id: preview.body.id, confirmation: 'REGLER' },
    });
  assert.equal((await apply()).status, 409);
  assert.equal(db.prepare('SELECT status FROM matches WHERE id=?').get(a.id).status, 'UPCOMING');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ledger WHERE reason='BET_PAYOUT'").get().n, 0);
  db.prepare('UPDATE matches SET homeTeam=? WHERE id=?').run(b.homeTeam, b.id);
  assert.equal((await apply()).status, 200);
  assert.equal((await apply()).body.replayed, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ledger WHERE reason='BET_PAYOUT'").get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM odds_calls').get().n, 0);
  assert.equal(
    (
      await request('/admin/operations/backup', {
        method: 'POST',
        session: adminSession,
        body: { confirmation: 'SAUVEGARDER' },
      })
    ).status,
    409,
  );
});

test('global sync publishes odds and settles linked bets in one protected request without duplicate payout', async (t) => {
  const competition = 'soccer_france_ligue_one';
  const cup = 'soccer_uefa_champs_league';
  const path = '/admin/odds/sync';
  const kickoff = new Date(Date.now() - 7200000).toISOString();
  const calls = [];
  const f = await fixture(t, {
    football: {
      oddsMode: 'manual',
      oddsKey: 'fake-score-test-key',
      oddsDailyLimit: 3,
      oddsFetch: async (url) => {
        const endpoint = new URL(url).pathname;
        const sportKey = endpoint.split('/')[3];
        calls.push(endpoint);
        return Response.json(
          endpoint.endsWith('/scores/')
            ? [
                {
                  id: 'settlement-event',
                  sport_key: competition,
                  commence_time: kickoff,
                  completed: true,
                  home_team: 'Home FC',
                  away_team: 'Away FC',
                  last_update: new Date().toISOString(),
                  scores: [
                    { name: 'Home FC', score: '2' },
                    { name: 'Away FC', score: '1' },
                  ],
                },
              ]
            : [
                {
                  id: `future-${sportKey}`,
                  sport_key: sportKey,
                  commence_time: new Date(Date.now() + 86400000).toISOString(),
                  home_team: `New ${sportKey}`,
                  away_team: 'Visitors FC',
                  bookmakers: [
                    {
                      key: 'winamax_fr',
                      last_update: new Date().toISOString(),
                      markets: [
                        {
                          key: 'h2h',
                          outcomes: [
                            { name: `New ${sportKey}`, price: 2 },
                            { name: 'Draw', price: 3.2 },
                            { name: 'Visitors FC', price: 3.5 },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
        );
      },
    },
  });
  const { db, request, adminSession, aliceSession } = f;
  const match = await f.makeMatch({ competition: 'Ligue 1' });
  assert.equal((await f.claim()).status, 200);
  assert.equal((await f.bet(match)).status, 201);
  db.prepare('UPDATE matches SET startDate=?,oddsHome=300 WHERE id=?').run(kickoff, match.id);
  db.prepare(
    `INSERT INTO odds_fixtures
    (externalId,sportKey,competition,homeTeam,awayTeam,startDate,quotes,fetchedAt,snapshotId,matchId)
    VALUES ('settlement-event',?,'Ligue 1','Home FC','Away FC',?,'[]',?,?,?)`,
  ).run(competition, kickoff, Date.now(), randomUUID(), match.id);
  const action = {
    method: 'POST',
    session: adminSession,
    body: {
      mode: 'global',
      competitions: [competition, cup],
      date: new Date().toISOString().slice(0, 10),
      bookmaker: 'winamax_fr',
      consent: true,
    },
    headers: { 'Idempotency-Key': randomUUID() },
  };
  assert.equal((await request('/admin/odds', { session: adminSession })).status, 200);
  assert.equal((await request(path, { ...action, session: aliceSession })).status, 403);
  assert.equal(
    (await request(path, { ...action, headers: { ...action.headers, 'X-CSRF-Token': 'invalid' } }))
      .status,
    403,
  );
  assert.equal(
    (await request(path, { ...action, body: { ...action.body, consent: false } })).status,
    400,
  );
  assert.equal(
    (
      await request(path, {
        ...action,
        body: { ...action.body, competitions: [competition, cup, 'soccer_epl'] },
      })
    ).status,
    429,
  );
  assert.equal(calls.length, 0);
  const result = await request(path, action);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(
    result.body.batchResults.map(({ kind, applied }) => [kind, applied]),
    [
      ['odds', 1],
      ['scores', 1],
      ['odds', 1],
    ],
  );
  assert.equal(result.body.usage.monthlyUsed, 4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM matches WHERE status='UPCOMING'").get().n, 2);
  assert.equal(
    db.prepare('SELECT status FROM matches WHERE id=?').get(match.id).status,
    'FINISHED',
  );
  const wallet = async () => (await request('/wallet', { session: aliceSession })).body.balance;
  assert.equal(await wallet(), 580);
  assert.equal((await request(path, action)).body.replayed, true);
  const cached = await request(path, { ...action, headers: { 'Idempotency-Key': randomUUID() } });
  assert.equal(cached.status, 200, JSON.stringify(cached.body));
  assert.ok(
    cached.body.batchResults.every(({ status, applied }) => status === 'CACHED' && applied === 0),
  );
  assert.equal(await wallet(), 580);
  assert.deepEqual(
    calls.map((call) => call.split('/').at(-2)),
    ['odds', 'scores', 'odds'],
  );
});

test('deleting an agency director transfers direction and preserves other members', async (t) => {
  const { db, request, alice, bob, aliceSession, login } = await fixture(t);
  const created = await request('/agence', {
    method: 'POST',
    session: aliceSession,
    body: { name: 'Privacy Club' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const invitation = await request('/agence/invitations', {
    method: 'POST',
    session: aliceSession,
    body: { username: 'bob' },
  });
  assert.equal(invitation.status, 201);
  const bobSession = await login('bob');
  const pending = await request('/agence/invitations', { session: bobSession });
  assert.equal(
    (
      await request('/agence/invitations/' + pending.body[0].id + '/accept', {
        method: 'POST',
        session: bobSession,
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/users/me', {
        method: 'DELETE',
        session: aliceSession,
        body: { password: credentials.password, confirmation: 'SUPPRIMER' },
      })
    ).status,
    200,
  );
  assert.equal(
    db.prepare('SELECT role FROM memberships WHERE userId=?').get(bob.id).role,
    'DIRECTEUR',
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id=?').get(alice.id).n, 0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('push device registration needs opt-in, encrypts tokens and logout detaches the device', async (t) => {
  const { db, request, aliceSession, alice } = await fixture(t, {
    football: {
      pushEnabled: true,
      pushTokenKey: 'ab'.repeat(32),
      pushAccountFile: 'not-read-in-this-test',
      pushProject: 'betverse-test',
    },
  });
  const token = 'test-token-for-device-123456789';
  const register = () =>
    request('/notifications/devices', { method: 'POST', session: aliceSession, body: { token } });
  assert.equal((await register()).status, 409);
  assert.equal(
    (
      await request('/notifications/preferences', {
        method: 'PATCH',
        session: aliceSession,
        body: { bets: true, agencies: true, push: true },
      })
    ).status,
    200,
  );
  assert.equal((await register()).status, 200);
  const device = db.prepare('SELECT * FROM push_devices WHERE userId=?').get(alice.id);
  assert.equal(device.cipher.includes(token), false);
  assert.notEqual(device.tokenHash, token);
  const { notify } = await import('../domain/accounts.mjs');
  const { transaction } = await import('../lib/errors.mjs');
  assert.throws(() =>
    transaction(db, () => {
      notify(db, alice.id, 'BET_WON', 'Example', 'Test only');
      throw Error('rollback');
    }),
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_outbox').get().n, 0);
  notify(db, alice.id, 'BET_WON', 'Example', 'Test only');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_outbox').get().n, 1);
  assert.equal(
    (await request('/auth/logout', { method: 'POST', session: aliceSession, body: {} })).status,
    200,
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_devices').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_outbox').get().n, 0);
});

test('maintenance freezes game mutations but keeps reads and admin journal reconciliation available', async (t) => {
  const { request, aliceSession, adminSession, db } = await fixture(t, {
    football: { maintenance: true },
  });
  assert.equal((await request('/wallet', { session: aliceSession })).status, 200);
  const denied = await request('/wallet/claim', {
    method: 'POST',
    session: aliceSession,
    body: {},
  });
  assert.equal(denied.status, 503);
  assert.equal(denied.headers.get('retry-after'), '300');
  assert.equal(
    (
      await request('/users/me', {
        method: 'DELETE',
        session: aliceSession,
        body: { password: credentials.password, confirmation: 'SUPPRIMER' },
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await request('/admin/operations/erasure-journal', {
        method: 'POST',
        session: adminSession,
        body: { confirmation: 'SYNCHRONISER' },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request('/admin/operations', { session: adminSession })).body.maintenance,
    true,
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM odds_calls').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM erasure_receipts').get().n, 0);
});

test('account deletion stays committed when the off-server erasure journal is temporarily unavailable', async (t) => {
  let attempts = 0;
  const { db, request, aliceSession, alice } = await fixture(t, {
    football: {
      backupService: {
        state: { configured: true },
        syncErasures: async () => {
          attempts++;
          throw Error('simulated-storage-outage');
        },
      },
    },
  });
  const response = await request('/users/me', {
    method: 'DELETE',
    session: aliceSession,
    body: { password: credentials.password, confirmation: 'SUPPRIMER' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.backupJournalPending, true);
  assert.equal(attempts, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id=?').get(alice.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM erasure_receipts').get().n, 1);
  assert.equal((await request('/auth/me', { session: aliceSession })).status, 401);
});
