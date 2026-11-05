// Ephemeral local server used ONLY by the Kotlin contract test. Never imports production .env.
import { once } from 'node:events';
import { createApp } from '../app.mjs';
import { openDatabase } from '../db/database.mjs';
import { configFromEnv } from '../lib/config.mjs';
import { createUser } from '../domain/accounts.mjs';
import { hashPassword } from '../lib/security.mjs';
import { randomUUID } from 'node:crypto';

const db = openDatabase(':memory:');
const config = {
  ...configFromEnv({}),
  test: true,
  database: ':memory:',
  staticDir: '/nonexistent-betverse-test',
  footballMode: 'disabled',
};
createUser(db, {
  email: 'native@example.test',
  username: 'native-test',
  passwordHash: await hashPassword('NativeTest123456'),
});
const timestamp = new Date().toISOString();
db.prepare(
  'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,sportKey,sportTitle,competition,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
).run(
  randomUUID(),
  'Paris',
  'Arsenal',
  new Date(Date.now() + 3600000).toISOString(),
  210,
  315,
  340,
  'football',
  'Football',
  'Recette native',
  timestamp,
);
const app = await createApp({ db, config });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
config.origin = 'http://localhost:' + server.address().port;
console.log(JSON.stringify({ origin: config.origin }));
const stop = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
