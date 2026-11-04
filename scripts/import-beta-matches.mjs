// Explicit one-off command only. Never imported by startup, builds or migrations.
import { statSync } from 'node:fs';
import { configFromEnv } from '../server/lib/config.mjs';
import { renderEnvironment } from '../server/lib/render.mjs';
import { openDatabase } from '../server/db/database.mjs';
import { importBetaMatches } from '../server/domain/beta-matches.mjs';

let db;
try {
  const [, , adminUsername, scheduledAt] = process.argv;
  if (!adminUsername || !scheduledAt || process.argv.length !== 4)
    throw new Error(
      'Usage : node scripts/import-beta-matches.mjs PSEUDO_ADMIN HORAIRE_ISO_AVEC_FUSEAU',
    );
  const env = process.env.RENDER === 'true' ? renderEnvironment() : process.env;
  const config = configFromEnv(env);
  // Do not silently create an empty production database when the target is wrong.
  if (config.production && !statSync(config.database).isFile())
    throw new Error('La base de production existante est requise.');
  db = openDatabase(config.database);
  const rows = importBetaMatches(db, adminUsername, scheduledAt);
  for (const row of rows)
    console.log(`${row.created ? 'Créé' : 'Déjà présent'} : ${row.homeTeam} — ${row.awayTeam}`);
  console.log(
    `${rows.filter((row) => row.created).length} rencontre(s) créée(s). Aucun appel fournisseur.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db?.close();
}
