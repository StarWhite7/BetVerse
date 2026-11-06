import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { join, resolve, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db/database.mjs';
import { createUser } from '../domain/accounts.mjs';
import { eraseAccountData } from '../domain/privacy.mjs';
import { createErasureManifest } from '../lib/erasures.mjs';
import { createEncryptedBackup, restoreEncryptedBackup, backupWorker } from '../lib/backups.mjs';
const key = 'ab'.repeat(32);
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'betverse-erasure-')),
    db = openDatabase(':memory:');
  t.after(async () => {
    db.close();
    const target = resolve(directory);
    assert.ok(
      target.startsWith(resolve(tmpdir()) + sep) &&
        basename(target).startsWith('betverse-erasure-'),
    );
    await rm(target, { recursive: true, force: true });
  });
  const user = (name) =>
    createUser(db, {
      username: name,
      email: name + '@example.test',
      passwordHash: 'test-only-no-login',
    });
  return { directory, db, user };
}
test('restore requires the matching authenticated erasure journal, removes deleted accounts and revokes all sessions', async (t) => {
  const { directory, db, user } = await fixture(t),
    alice = user('alice'),
    bob = user('bob');
  db.prepare('UPDATE wallets SET balance=123 WHERE userId=?').run(bob.id);
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
    'alice-session',
    alice.id,
    'csrf',
    Date.now() + 3600000,
  );
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
    'bob-session',
    bob.id,
    'csrf',
    Date.now() + 3600000,
  );
  const snapshot = await createEncryptedBackup(db, { directory, key });
  eraseAccountData(db, alice.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM erasure_receipts').get().n, 1);
  const manifest = join(directory, 'current.bverasures');
  await writeFile(manifest, createErasureManifest(db, key));
  const output = join(directory, 'restored.sqlite');
  await assert.rejects(
    () => restoreEncryptedBackup({ input: snapshot.file, output, key }),
    /Journal récent/,
  );
  const result = await restoreEncryptedBackup({
    input: snapshot.file,
    output,
    key,
    erasureManifest: manifest,
  });
  assert.deepEqual(result.reconciliation, { erased: 1, receipts: 1, sessionsRevoked: true });
  const restored = new DatabaseSync(output);
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM users WHERE id=?').get(alice.id).n, 0);
  assert.equal(
    restored.prepare('SELECT balance FROM wallets WHERE userId=?').get(bob.id).balance,
    123,
  );
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
  restored.close();
  const different = openDatabase(':memory:');
  await writeFile(manifest, createErasureManifest(different, key));
  different.close();
  await assert.rejects(
    () =>
      restoreEncryptedBackup({
        input: snapshot.file,
        output: join(directory, 'wrong.sqlite'),
        key,
        erasureManifest: manifest,
      }),
    /installation/,
  );
  const altered = createErasureManifest(db, key);
  altered[altered.length - 1] ^= 1;
  await writeFile(manifest, altered);
  await assert.rejects(() =>
    restoreEncryptedBackup({
      input: snapshot.file,
      output: join(directory, 'tampered.sqlite'),
      key,
      erasureManifest: manifest,
    }),
  );
});
test('journal sync includes deletions committed while a previous upload is in flight', async (t) => {
  const { directory, db, user } = await fixture(t),
    alice = user('alice'),
    bob = user('bob');
  const snapshot = await createEncryptedBackup(db, { directory, key });
  let release, start;
  const held = new Promise((resolve) => (release = resolve)),
    began = new Promise((resolve) => (start = resolve));
  let calls = 0,
    latest;
  const worker = backupWorker(db, {
    backupKey: key,
    backupDirectory: directory,
    backupUploadBase: 'https://storage.example/',
    backupFetch: async (url, options) => {
      calls++;
      if (calls === 1) {
        start();
        await held;
      }
      if (url.endsWith('/erasures-latest.bverasures')) latest = Buffer.from(options.body);
      return new Response(null, { status: 201 });
    },
  });
  t.after(() => worker.stop());
  eraseAccountData(db, alice.id);
  const first = worker.syncErasures();
  await began;
  eraseAccountData(db, bob.id);
  const second = worker.syncErasures();
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 4);
  assert.equal(worker.state.erasureJournal.pending, false);
  const manifest = join(directory, 'current.bverasures');
  await writeFile(manifest, latest);
  const result = await restoreEncryptedBackup({
    input: snapshot.file,
    output: join(directory, 'restored.sqlite'),
    key,
    erasureManifest: manifest,
  });
  assert.equal(result.reconciliation.erased, 2);
});
test('a refused journal upload blocks the next database backup and exposes its pending state', async (t) => {
  const { directory, db, user } = await fixture(t);
  eraseAccountData(db, user('alice').id);
  let calls = 0;
  const worker = backupWorker(db, {
    backupKey: key,
    backupDirectory: directory,
    backupUploadBase: 'https://storage.example/',
    backupFetch: async () => {
      calls++;
      return new Response(null, { status: 503 });
    },
  });
  t.after(() => worker.stop());
  await assert.rejects(worker.run);
  assert.equal(calls, 1);
  assert.equal(worker.state.erasureJournal.pending, true);
  assert.ok(worker.state.erasureJournal.lastError);
  assert.equal((await readdir(directory)).filter((name) => name.endsWith('.bvbackup')).length, 0);
});

test('erasure receipts roll back with the account and stale or incomplete journals are rejected', async (t) => {
  const { directory, db, user } = await fixture(t),
    alice = user('alice');
  const { transaction } = await import('../lib/errors.mjs');
  const { applyErasureManifest } = await import('../lib/erasures.mjs');
  const emptyJournal = createErasureManifest(db, key);
  assert.throws(() =>
    transaction(db, () => {
      eraseAccountData(db, alice.id);
      throw Error('rollback');
    }),
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM erasure_receipts').get().n, 0);
  assert.throws(
    () => applyErasureManifest(db, emptyJournal, key, { at: Date.now() + 25 * 3600000 }),
    /récent/,
  );
  eraseAccountData(db, alice.id);
  assert.throws(() => applyErasureManifest(db, emptyJournal, key), /incomplet/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM erasure_receipts').get().n, 1);
});

test('a snapshot and its latest erasure journal may use separate encryption keys', async (t) => {
  const { directory, db, user } = await fixture(t),
    alice = user('alice');
  const copy = await createEncryptedBackup(db, { directory, key });
  eraseAccountData(db, alice.id);
  const journalKey = 'cd'.repeat(32),
    manifest = join(directory, 'current.bverasures');
  await writeFile(manifest, createErasureManifest(db, journalKey));
  await assert.rejects(() =>
    restoreEncryptedBackup({
      input: copy.file,
      output: join(directory, 'wrong-key.sqlite'),
      key,
      erasureManifest: manifest,
    }),
  );
  const result = await restoreEncryptedBackup({
    input: copy.file,
    output: join(directory, 'restored.sqlite'),
    key,
    erasureKey: journalKey,
    erasureManifest: manifest,
  });
  assert.equal(result.reconciliation.erased, 1);
});
