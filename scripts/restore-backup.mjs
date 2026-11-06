// Restores to a NEW offline file. Never replaces a running production database.
import { resolve } from 'node:path';
import { restoreEncryptedBackup } from '../server/lib/backups.mjs';
const [input, output, erasureManifest, confirmation] = process.argv.slice(2);
if (!input || !output || !process.env.BACKUP_ENCRYPTION_KEY)
  throw new Error(
    'Usage : BACKUP_ENCRYPTION_KEY configurée, node scripts/restore-backup.mjs archive.bvbackup nouveau-fichier.sqlite erasures-latest.bverasures --source-stopped',
  );
if (
  resolve(input) === resolve(output) ||
  (process.env.DATABASE_PATH && resolve(output) === resolve(process.env.DATABASE_PATH))
)
  throw new Error('Choisir un nouveau fichier distinct de la base active.');
if (!erasureManifest || confirmation !== '--source-stopped')
  throw new Error(
    'Figer les écritures de la source, republier/télécharger erasures-latest.bverasures puis fournir son chemin et --source-stopped.',
  );
try {
  console.log(
    JSON.stringify(
      await restoreEncryptedBackup({
        input: resolve(input),
        output: resolve(output),
        erasureManifest: resolve(erasureManifest),
        erasureKey: process.env.ERASURE_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY,
        key: process.env.BACKUP_ENCRYPTION_KEY,
      }),
    ),
  );
} catch {
  console.error(
    'Restauration refusée : clé, fichier ou cohérence invalides. Aucun remplacement de base active.',
  );
  process.exitCode = 1;
}
