import { backup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { configFromEnv } from './lib/config.mjs';
import { openDatabase } from './db/database.mjs';
import { hashPassword } from './lib/security.mjs';
import { z, username, password } from './lib/validation.mjs';
import { createUser, now } from './domain/accounts.mjs';
const config = configFromEnv(),
  db = openDatabase(config.database);
try {
  const command = process.argv[2];
  if (command === 'admin') {
    const input = z
      .object({ email: z.email(), username, password })
      .parse({
        email: process.env.ADMIN_EMAIL,
        username: process.env.ADMIN_USERNAME,
        password: process.env.ADMIN_PASSWORD,
      });
    if (
      db.prepare('SELECT 1 FROM users WHERE email=? OR username=?').get(input.email, input.username)
    )
      throw new Error('Le compte existe déjà. Aucune promotion implicite autorisée.');
    createUser(db, {
      ...input,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      role: 'ADMIN',
    });
    console.log('Compte administrateur créé. Retirez ADMIN_PASSWORD du fichier .env.');
  } else if (command === 'seed-demo') {
    if (config.production)
      throw new Error('Les données de démonstration sont interdites en production.');
    for (const [index, teams] of [
      ['Équipe Démo A', 'Équipe Démo B'],
      ['Équipe Démo C', 'Équipe Démo D'],
    ].entries()) {
      db.prepare(
        'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,competition,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      ).run(
        randomUUID(),
        teams[0],
        teams[1],
        new Date(Date.now() + (index + 1) * 86400000).toISOString(),
        180,
        240,
        310,
        'Démonstration locale',
        now(),
      );
    }
    console.log('Deux rencontres de démonstration ajoutées.');
  } else if (command === 'backup') {
    const target = resolve(process.env.BACKUP_PATH || `${config.database}.${Date.now()}.backup`);
    if (target === config.database) throw new Error('La sauvegarde doit avoir un chemin distinct.');
    mkdirSync(dirname(target), { recursive: true });
    await backup(db, target);
    console.log(`Sauvegarde créée : ${target}`);
  } else throw new Error('Commande attendue : admin, seed-demo, backup.');
} catch (error) {
  // Zod errors can contain received secret values: never serialize them.
  console.error(
    error instanceof z.ZodError
      ? 'ADMIN_EMAIL, ADMIN_USERNAME et un ADMIN_PASSWORD fort sont requis.'
      : error.message,
  );
  process.exitCode = 1;
} finally {
  db.close();
}
