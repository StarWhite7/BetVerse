// Disposable browser QA environment. Never imported by the production entry point.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../db/database.mjs';
import { createApp } from '../app.mjs';
import { configFromEnv } from '../lib/config.mjs';
import { createUser, now } from '../domain/accounts.mjs';
import { hashPassword } from '../lib/security.mjs';
if (process.env.NODE_ENV === 'production') throw new Error('QA fixture forbidden in production');
const directory = mkdtempSync(join(tmpdir(), 'betverse-browser-'));
const database = process.env.QA_DATABASE_PATH
  ? resolve(process.env.QA_DATABASE_PATH)
  : join(directory, 'qa.sqlite');
if (!database.startsWith(join(tmpdir(), 'betverse-browser-')) || basename(database) !== 'qa.sqlite')
  throw new Error('Only disposable QA databases are allowed');
const port = Number(process.env.QA_PORT || 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid QA port');
const config = { ...configFromEnv({}), origin: `http://localhost:${port}`, database };
const db = openDatabase(config.database);
if (!db.prepare("SELECT 1 FROM users WHERE username='qa-admin'").get())
  createUser(db, {
    email: 'qa-admin@example.test',
    username: 'qa-admin',
    role: 'ADMIN',
    passwordHash: await hashPassword('BrowserTestOnly123'),
  });
if (!db.prepare('SELECT 1 FROM matches').get())
  db.prepare(
    'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,competition,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    randomUUID(),
    'Paris Saint-Germain',
    'Olympique de Marseille',
    new Date(Date.now() + 86400000).toISOString(),
    180,
    240,
    310,
    'Démonstration QA',
    now(),
  );
const app = await createApp({ db, config });
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`QA http://localhost:${port} ; database ${config.database}`),
);
process.on('SIGTERM', () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
