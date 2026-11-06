import { backup, DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile, unlink, stat, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { ensure } from './errors.mjs';
import { installationId, createErasureManifest, applyErasureManifest } from './erasures.mjs';
const MAGIC = Buffer.from('BVBK01');
export async function createEncryptedBackup(db, { directory, key, maxBytes = 32 * 1024 * 1024 }) {
  ensure(/^[a-fA-F0-9]{64}$/.test(key || ''), 400, 'Clé de sauvegarde invalide.');
  directory = resolve(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${randomUUID()}.snapshot`);
  try {
    await writeFile(temporary, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
    await backup(db, temporary);
    ensure(
      (await stat(temporary)).size <= maxBytes,
      409,
      'Base trop volumineuse pour la politique de sauvegarde configurée.',
    );
    const snapshot = await readFile(temporary),
      iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    cipher.setAAD(MAGIC);
    const encrypted = Buffer.concat([cipher.update(gzipSync(snapshot)), cipher.final()]);
    const file = join(directory, `betverse-${Date.now()}-${randomUUID()}.bvbackup`);
    await writeFile(file, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]), {
      mode: 0o600,
      flag: 'wx',
    });
    return {
      file,
      createdAt: new Date().toISOString(),
      sha256: createHash('sha256').update(snapshot).digest('hex'),
      bytes: snapshot.length,
    };
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function restoreEncryptedBackup({
  input,
  output,
  key,
  erasureManifest,
  erasureKey = key,
  maxBytes = 32 * 1024 * 1024,
}) {
  ensure(/^[a-fA-F0-9]{64}$/.test(key || ''), 400, 'Clé de sauvegarde invalide.');
  ensure((await stat(input)).size <= maxBytes + 1024 * 1024, 400, 'Archive trop volumineuse.');
  const value = await readFile(input);
  ensure(
    value.subarray(0, 6).equals(MAGIC) && value.length > 34,
    400,
    'Format de sauvegarde invalide.',
  );
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), value.subarray(6, 18));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(value.subarray(18, 34));
  const plain = gunzipSync(Buffer.concat([decipher.update(value.subarray(34)), decipher.final()]), {
    maxOutputLength: maxBytes,
  });
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, plain, { flag: 'wx', mode: 0o600 });
  let db;
  try {
    db = new DatabaseSync(output);
    db.exec('PRAGMA foreign_keys=ON');
    ensure(
      db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok',
      400,
      'Sauvegarde incohérente.',
    );
    ensure(
      db.prepare('PRAGMA foreign_key_check').all().length === 0,
      400,
      'Clés étrangères incohérentes.',
    );
    let reconciliation = null;
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get()) {
      ensure(
        erasureManifest,
        409,
        'Journal récent des suppressions requis pour restaurer une base BetVerse.',
      );
      ensure(
        (await stat(erasureManifest)).size <= 32 * 1024 * 1024,
        400,
        'Journal trop volumineux.',
      );
      reconciliation = applyErasureManifest(db, await readFile(erasureManifest), erasureKey);
      ensure(
        db.prepare('PRAGMA foreign_key_check').all().length === 0,
        400,
        'Réconciliation incohérente.',
      );
    }
    return {
      valid: true,
      bytes: plain.length,
      sha256: createHash('sha256').update(plain).digest('hex'),
      ...(reconciliation ? { reconciliation } : {}),
    };
  } catch (error) {
    db?.close();
    db = null;
    await unlink(output);
    throw error;
  } finally {
    db?.close();
  }
}
export function backupWorker(db, config) {
  let running = false;
  let journalSync = null,
    lastJournalSignature = null;
  const state = {
    configured: Boolean(config.backupKey && config.backupDirectory && config.backupUploadBase),
    running: false,
    lastSuccess: null,
    lastError: null,
    erasureJournal: { lastSuccess: null, lastError: null, pending: true },
  };
  async function upload(name, body) {
    const url = new URL(encodeURIComponent(name), config.backupUploadBase.replace(/\/?$/, '/'));
    const response = await (config.backupFetch || fetch)(url.href, {
      method: 'PUT',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(config.backupUploadAuth ? { Authorization: config.backupUploadAuth } : {}),
      },
      body,
    });
    await response.body?.cancel();
    ensure(response.ok, 502, 'Le stockage distant a refusé le transfert.');
  }
  async function syncErasures(force = false) {
    ensure(state.configured, 409, 'Stockage distant non configuré.');
    if (!installationId(db)) return null; // Generic SQLite fixtures do not contain accounts.
    if (journalSync) {
      await journalSync;
      return syncErasures(force);
    }
    const signature = createHash('sha256')
      .update(
        JSON.stringify(
          db
            .prepare('SELECT subjectHash,deletedAt FROM erasure_receipts ORDER BY subjectHash')
            .all(),
        ),
      )
      .digest('hex');
    if (!force && signature === lastJournalSignature) return;
    journalSync = Promise.resolve().then(async () => {
      try {
        state.erasureJournal.pending = true;
        const bytes = createErasureManifest(db, config.erasureKey || config.backupKey);
        const name = `erasures-${Date.now()}-${randomUUID()}.bverasures`;
        await upload(name, bytes);
        await upload('erasures-latest.bverasures', bytes);
        lastJournalSignature = signature;
        state.erasureJournal.lastSuccess = new Date().toISOString();
        state.erasureJournal.lastError = null;
        state.erasureJournal.pending = false;
      } catch (error) {
        state.erasureJournal.lastError =
          'Journal des suppressions non confirmé sur le stockage distant.';
        throw error;
      } finally {
        journalSync = null;
      }
    });
    return journalSync;
  }
  async function run() {
    ensure(
      state.configured,
      409,
      'Configurer la clé privée, le dossier et le stockage distant avant la sauvegarde.',
    );
    ensure(!running, 409, 'Une sauvegarde est déjà en cours.');
    running = true;
    state.running = true;
    try {
      await syncErasures(true);
      const result = await createEncryptedBackup(db, {
        directory: config.backupDirectory,
        key: config.backupKey,
      });
      await upload(result.file.split(/[\\/]/).at(-1), await readFile(result.file));
      state.lastSuccess = result.createdAt;
      state.lastError = null;
      const files = (await readdir(config.backupDirectory))
        .filter((name) => /^betverse-\d+-[a-f0-9-]+\.bvbackup$/.test(name))
        .sort()
        .reverse();
      for (const name of files.slice(3)) await unlink(join(config.backupDirectory, name));
      return { success: true, createdAt: result.createdAt, bytes: result.bytes };
    } catch {
      state.lastError = 'Échec de sauvegarde : vérifier stockage, espace et configuration privés.';
      throw new Error(state.lastError);
    } finally {
      running = false;
      state.running = false;
    }
  }
  const timer =
    state.configured && config.backupEnabled
      ? setInterval(() => run().catch(() => {}), 24 * 60 * 60 * 1000).unref()
      : null;
  const journalTimer = state.configured
    ? setInterval(() => syncErasures().catch(() => {}), 60000).unref()
    : null;
  return {
    state,
    run,
    syncErasures,
    stop: () => {
      if (timer) clearInterval(timer);
      if (journalTimer) clearInterval(journalTimer);
    },
  };
}
