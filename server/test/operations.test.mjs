import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../db/database.mjs';
import { createUser, now } from '../domain/accounts.mjs';
import { cancelMatch } from '../domain/matches.mjs';
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'betverse-ops-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
test('admin bootstrap refuses defaults and does not promote an existing identity', async (t) => {
  const path = join(await directory(t), 'db.sqlite');
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: 'development',
    DATABASE_PATH: path,
  };
  const invoke = (extra) =>
    spawnSync(process.execPath, [cli, 'admin'], { env: { ...env, ...extra }, encoding: 'utf8' });
  assert.equal(invoke({}).status, 1);
  const credentials = {
    ADMIN_EMAIL: 'ops@example.test',
    ADMIN_USERNAME: 'ops-admin',
    ADMIN_PASSWORD: 'OperationTestOnly123',
  };
  assert.equal(invoke(credentials).status, 0);
  const repeated = invoke(credentials);
  assert.equal(repeated.status, 1);
  assert.ok(!repeated.stdout.includes(credentials.ADMIN_PASSWORD));
  assert.ok(!repeated.stderr.includes(credentials.ADMIN_PASSWORD));
  const db = openDatabase(path);
  assert.equal(db.prepare('SELECT role FROM users').get().role, 'ADMIN');
  db.close();
});
test('native backup can be restored with committed data', async (t) => {
  const folder = await directory(t),
    path = join(folder, 'db.sqlite'),
    snapshot = join(folder, 'snapshot.sqlite');
  const db = openDatabase(path);
  const user = createUser(db, {
    email: 'backup@example.test',
    username: 'backup-user',
    passwordHash: 'test-hash',
  });
  db.prepare('UPDATE wallets SET balance=123 WHERE userId=?').run(user.id);
  const result = spawnSync(process.execPath, [cli, 'backup'], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'development',
      DATABASE_PATH: path,
      BACKUP_PATH: snapshot,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  db.close();
  const restored = openDatabase(snapshot);
  assert.equal(
    restored.prepare('SELECT balance FROM wallets WHERE userId=?').get(user.id).balance,
    123,
  );
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
  restored.close();
});
test('cancellation migration preserves existing matches, bets, memberships and votes', async (t) => {
  const path = join(await directory(t), 'db.sqlite');
  const old = new DatabaseSync(path);
  old.exec(
    'PRAGMA foreign_keys=ON;CREATE TABLE migrations(name TEXT PRIMARY KEY,appliedAt TEXT NOT NULL);',
  );
  for (const name of [
    '001-initial.sql',
    '002-agency-missions.sql',
    '003-email-verification.sql',
    '004-wallet-idempotency.sql',
  ]) {
    old.exec(await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'));
    old.prepare('INSERT INTO migrations VALUES (?,?)').run(name, now());
  }
  const user = createUser(old, {
    email: 'migration@example.test',
    username: 'migration-user',
    passwordHash: 'test-hash',
    role: 'ADMIN',
  });
  const matchId = randomUUID(),
    betId = randomUUID(),
    agencyId = randomUUID();
  old
    .prepare(
      'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,createdAt) VALUES (?,?,?,?,?,?,?)',
    )
    .run(matchId, 'Home', 'Away', new Date(Date.now() + 86400000).toISOString(), 200, 200, now());
  old
    .prepare(
      'INSERT INTO bets (id,userId,matchId,match,betType,amount,odds,createdAt,requestKey,requestHash) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .run(betId, user.id, matchId, 'Home vs Away', 'HOME', 100, 200, now(), randomUUID(), 'hash');
  old
    .prepare(
      'INSERT INTO agencies (id,name,logoId,primaryColor,secondaryColor,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
    .run(agencyId, 'Migration agency', 'logo-1', '#ffffff', '#000000', now(), now());
  old.prepare("INSERT INTO memberships VALUES (?,?,'DIRECTEUR',?)").run(user.id, agencyId, now());
  old
    .prepare('INSERT INTO votes (userId,agencyId,matchId,homeScore,awayScore) VALUES (?,?,?,?,?)')
    .run(user.id, agencyId, matchId, 1, 0);
  old.close();
  const db = openDatabase(path);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM memberships').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM votes').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  cancelMatch(db, user.id, matchId, 'Rencontre reportée pendant le test de migration');
  assert.equal(db.prepare('SELECT status FROM bets WHERE id=?').get(betId).status, 'VOID');
  assert.equal(db.prepare('SELECT balance FROM wallets WHERE userId=?').get(user.id).balance, 100);
  db.close();
});

test('production backup refuses an unconfigured encrypted destination instead of writing plaintext', async (t) => {
  const folder = await directory(t),
    path = join(folder, 'production.sqlite'),
    snapshot = join(folder, 'must-not-exist.sqlite');
  const result = spawnSync(process.execPath, [cli, 'backup'], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'production',
      DATABASE_PATH: path,
      APP_ORIGIN: 'https://example.test',
      SMTP_URL: 'smtps://example.test:465',
      MAIL_FROM: 'test@example.test',
      BACKUP_PATH: snapshot,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Configurer/);
  await assert.rejects(() => readFile(snapshot), { code: 'ENOENT' });
});
