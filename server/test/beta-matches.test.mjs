import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../db/database.mjs';
import { createUser } from '../domain/accounts.mjs';
import { importBetaMatches } from '../domain/beta-matches.mjs';

function setup(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  createUser(db, {
    email: 'admin@example.test',
    username: 'admin',
    passwordHash: 'unused',
    role: 'ADMIN',
  });
  const start = new Date(Date.now() + 86400000).toISOString();
  return { db, start };
}

test('screenshot import preserves all seven 1X2 prices, excludes live fixtures and is replay safe', (t) => {
  const { db, start } = setup(t);
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('No provider calls allowed');
  });
  assert.equal(importBetaMatches(db, 'admin', start).filter((row) => row.created).length, 7);
  assert.equal(importBetaMatches(db, 'admin', start).filter((row) => row.created).length, 0);
  const rows = db.prepare('SELECT * FROM matches').all();
  assert.equal(rows.length, 7);
  assert.equal(
    rows.some((row) => /AEK|Fenerbah/i.test(row.homeTeam)),
    false,
  );
  assert.ok(rows.every((row) => row.competition.startsWith('Recette')));
  const slavia = rows.find((row) => row.homeTeam === 'Slavia Prague');
  assert.deepEqual([slavia.oddsHome, slavia.oddsDraw, slavia.oddsAway], [1100, 560, 127]);
  const porto = rows.find((row) => row.homeTeam === 'FC Porto');
  assert.deepEqual([porto.oddsHome, porto.oddsDraw, porto.oddsAway], [197, 360, 375]);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='BETA_MATCH_CREATED'").get().n,
    7,
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM football_calls').get().n, 0);
});

test('past times, ambiguous timezones and missing admins do not create matches', (t) => {
  const { db, start } = setup(t);
  assert.throws(() => importBetaMatches(db, 'admin', '2020-01-01T21:00:00+01:00'), /futur/);
  assert.throws(() => importBetaMatches(db, 'admin', '2030-01-01T21:00:00'), /fuseau/);
  assert.throws(() => importBetaMatches(db, 'unknown', start), /administrateur/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
});

test('a modified existing quote rolls the entire import back instead of overwriting it', (t) => {
  const { db, start } = setup(t);
  importBetaMatches(db, 'admin', start);
  db.prepare("UPDATE matches SET oddsHome=999 WHERE homeTeam='FC Porto'").run();
  db.prepare("DELETE FROM matches WHERE homeTeam='Slavia Prague'").run();
  assert.throws(() => importBetaMatches(db, 'admin', start), /écrasée/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM matches').get().n, 6);
  assert.equal(
    db.prepare("SELECT oddsHome FROM matches WHERE homeTeam='FC Porto'").get().oddsHome,
    999,
  );
});
