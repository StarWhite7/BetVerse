import { configFromEnv } from './lib/config.mjs';
import { openDatabase } from './db/database.mjs';
import { createApp } from './app.mjs';
import { backupWorker } from './lib/backups.mjs';
const config = configFromEnv();
const db = openDatabase(config.database);
config.backupService = backupWorker(db, config);
const app = await createApp({ db, config });
const server = app.listen(config.port, config.host, () =>
  console.log(`BetVerse : http://${config.host}:${config.port}`),
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
let shuttingDown = false;
function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  config.backupService.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
