import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)');
  const directory = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(directory)
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    if (db.prepare('SELECT 1 FROM migrations WHERE name=?').get(name)) continue;
    // SQLite's documented table-rebuild migration procedure: suspend FK checks
    // outside the transaction, then check integrity before committing.
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL(name, directory), 'utf8'));
      db.prepare('INSERT INTO migrations VALUES (?,?)').run(name, new Date().toISOString());
      if (db.prepare('PRAGMA foreign_key_check').all().length)
        throw new Error('Migration violates foreign keys');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
    db.exec('PRAGMA foreign_keys=ON');
  }
  return db;
}
