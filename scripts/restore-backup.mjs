// Restores to a NEW offline file. Never replaces a running production database.
import {resolve} from 'node:path';
import {restoreEncryptedBackup} from '../server/lib/backups.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output||!process.env.BACKUP_ENCRYPTION_KEY)throw new Error('Usage : BACKUP_ENCRYPTION_KEY configurée, node scripts/restore-backup.mjs archive.bvbackup nouveau-fichier.sqlite');
if(resolve(input)===resolve(output)||process.env.DATABASE_PATH&&resolve(output)===resolve(process.env.DATABASE_PATH))throw new Error('Choisir un nouveau fichier distinct de la base active.');
try {console.log(JSON.stringify(await restoreEncryptedBackup({input:resolve(input),output:resolve(output),key:process.env.BACKUP_ENCRYPTION_KEY})));}
catch {console.error('Restauration refusée : clé, fichier ou cohérence invalides. Aucun remplacement de base active.');process.exitCode=1;}
