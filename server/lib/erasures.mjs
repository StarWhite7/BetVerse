import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { ensure, transaction } from './errors.mjs';
import { digest } from './security.mjs';
import { eraseAccountData } from '../domain/privacy.mjs';
import { audit } from '../domain/accounts.mjs';
const MAGIC = Buffer.from('BVER01');
export function installationId(db) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_metadata'").get())
    return null;
  return (
    db.prepare("SELECT value FROM app_metadata WHERE key='installation_id'").get()?.value || null
  );
}
export function createErasureManifest(db, key) {
  ensure(/^[a-f0-9]{64}$/i.test(key || ''), 400, 'Clé de journal invalide.');
  const sourceId = installationId(db);
  ensure(sourceId, 409, 'Migration du journal de suppressions requise.');
  const receipts = db
    .prepare('SELECT subjectHash,deletedAt FROM erasure_receipts ORDER BY subjectHash')
    .all();
  ensure(receipts.length <= 100000, 409, 'Journal trop volumineux pour cette version.');
  const payload = Buffer.from(
    JSON.stringify({ version: 1, sourceId, generatedAt: new Date().toISOString(), receipts }),
  );
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(MAGIC);
  const bytes = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), bytes]);
}
export function applyErasureManifest(db, bytes, key, { at = Date.now() } = {}) {
  ensure(
    Buffer.isBuffer(bytes) &&
      bytes.length > 34 &&
      bytes.length <= 32 * 1024 * 1024 &&
      bytes.subarray(0, 6).equals(MAGIC),
    400,
    'Format de journal invalide.',
  );
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), bytes.subarray(6, 18));
  cipher.setAAD(MAGIC);
  cipher.setAuthTag(bytes.subarray(18, 34));
  const manifest = JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(34)), cipher.final()]).toString('utf8'),
  );
  ensure(
    manifest.version === 1 && manifest.sourceId === installationId(db),
    409,
    'Le journal ne correspond pas à cette installation.',
  );
  const generated = Date.parse(manifest.generatedAt);
  ensure(
    Number.isFinite(generated) && generated <= at + 300000 && at - generated <= 24 * 60 * 60 * 1000,
    409,
    'Le journal doit être récent : figer les écritures de la source, republier puis télécharger le dernier journal.',
  );
  ensure(
    Array.isArray(manifest.receipts) &&
      manifest.receipts.length <= 100000 &&
      manifest.receipts.every(
        (r) =>
          /^[a-f0-9]{64}$/.test(r.subjectHash) &&
          Number.isFinite(Date.parse(r.deletedAt)) &&
          Date.parse(r.deletedAt) <= generated,
      ),
    400,
    'Reçus de suppression invalides.',
  );
  const hashes = new Set(manifest.receipts.map((r) => r.subjectHash));
  // Do not allow a journal older than receipts already present in this snapshot.
  ensure(
    db
      .prepare('SELECT subjectHash FROM erasure_receipts')
      .all()
      .every((r) => hashes.has(r.subjectHash)),
    409,
    'Journal incomplet par rapport à la sauvegarde.',
  );
  return transaction(db, () => {
    let erased = 0;
    for (const user of db.prepare('SELECT id FROM users ORDER BY id').all())
      if (hashes.has(digest(user.id))) {
        eraseAccountData(db, user.id);
        erased++;
      }
    for (const r of manifest.receipts)
      db.prepare(
        'INSERT INTO erasure_receipts VALUES (?,?) ON CONFLICT(subjectHash) DO UPDATE SET deletedAt=MIN(erasure_receipts.deletedAt,excluded.deletedAt)',
      ).run(r.subjectHash, r.deletedAt);
    db.exec('DELETE FROM sessions; DELETE FROM password_resets; DELETE FROM email_verifications;');
    audit(db, null, 'OFFLINE_RESTORE_RECONCILED', null, { erased, receipts: hashes.size });
    return { erased, receipts: hashes.size, sessionsRevoked: true };
  });
}
