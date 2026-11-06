import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { openDatabase } from '../db/database.mjs';
import { createUser, notify, now } from '../domain/accounts.mjs';
import { pushWorker, sealToken } from '../lib/push.mjs';
test('FCM outbox sends generic content only after opt-in, with no automatic retry or sports request', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'betverse-push-')),
    db = openDatabase(':memory:');
  t.after(async () => {
    db.close();
    const target = resolve(directory);
    assert.ok(
      target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('betverse-push-'),
    );
    await rm(target, { recursive: true, force: true });
  });
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const file = join(directory, 'fake-test-account.json');
  await writeFile(
    file,
    JSON.stringify({
      project_id: 'test-project',
      client_email: 'tester@test-project.iam.gserviceaccount.com',
      private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    }),
  );
  const user = createUser(db, {
      email: 'push@example.test',
      username: 'push-test',
      passwordHash: 'test-only-no-auth',
    }),
    key = 'ab'.repeat(32),
    token = 'fake-test-device-1234567890';
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
    'test-session',
    user.id,
    'test-csrf',
    Date.now() + 3600000,
  );
  db.prepare('INSERT INTO user_preferences VALUES (?,1,1,1)').run(user.id);
  db.prepare('INSERT INTO push_devices VALUES (?,?,?,?,?)').run(
    'hash',
    user.id,
    'test-session',
    sealToken(token, key),
    now(),
  );
  let calls = 0,
    reject = false;
  const config = {
    pushEnabled: true,
    pushProject: 'test-project',
    pushAccountFile: file,
    pushTokenKey: key,
    pushFetch: async (url, options) => {
      calls++;
      assert.equal(options.redirect, 'error');
      if (url === 'https://oauth2.googleapis.com/token')
        return Response.json({ access_token: 'test-oauth', expires_in: 3600 });
      assert.equal(url, 'https://fcm.googleapis.com/v1/projects/test-project/messages:send');
      const payload = JSON.parse(options.body);
      assert.equal(payload.message.token, token);
      assert.equal(options.body.includes(user.email), false);
      assert.equal(options.body.includes('SECRET_AMOUNT'), false);
      return reject
        ? Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 })
        : Response.json({ name: 'test-message' });
    },
  };
  const worker = pushWorker(db, config);
  t.after(() => worker.stop());
  notify(db, user.id, 'BET_WON', 'SECRET_AMOUNT', 'SECRET_AMOUNT');
  assert.equal(calls, 0);
  await worker.run();
  assert.equal(calls, 2);
  assert.equal(db.prepare('SELECT state FROM push_outbox').get().state, 'SENT');
  await worker.run();
  assert.equal(calls, 2);
  reject = true;
  notify(db, user.id, 'BET_WON', 'SECRET_AMOUNT', 'SECRET_AMOUNT');
  await worker.run();
  assert.equal(calls, 3);
  await worker.run();
  assert.equal(calls, 3);
  const disabled = pushWorker(db, { ...config, pushEnabled: false });
  notify(db, user.id, 'BET_WON', 'SECRET_AMOUNT', 'SECRET_AMOUNT');
  await disabled.run();
  assert.equal(calls, 3);
  db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id);
  await worker.run();
  assert.equal(calls, 3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM odds_calls').get().n, 0);
});
