import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../db/database.mjs';
import { createUser, movement } from '../domain/accounts.mjs';
import { placeCombinedBet, finishMatch, cancelMatch, hasMatchBets } from '../domain/matches.mjs';

function setup(t) {
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const user = createUser(db, {
    email: 'combo@example.test',
    username: 'combo',
    passwordHash: 'unused',
    role: 'ADMIN',
  }).id;
  movement(db, user, 1000, 'CREDIT', 'TEST', randomUUID());
  const matches = [randomUUID(), randomUUID(), randomUUID()];
  matches.forEach((id, index) =>
    db
      .prepare(
        'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,createdAt) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        `Home ${index}`,
        `Away ${index}`,
        new Date(clock + 3600000).toISOString(),
        191,
        240,
        310,
        new Date(clock).toISOString(),
      ),
  );
  const input = {
    amount: 100,
    selections: matches.slice(0, 2).map((matchId) => ({ matchId, betType: 'HOME', odds: 1.91 })),
  };
  return {
    db,
    user,
    matches,
    input,
    balance: () => db.prepare('SELECT balance FROM wallets WHERE userId=?').get(user).balance,
    started: () => {
      clock += 3600001;
    },
    finish: (id, won = true) =>
      finishMatch(db, user, id, {
        result: won ? 'HOME' : 'AWAY',
        homeScore: won ? 1 : 0,
        awayScore: won ? 0 : 1,
      }),
    place: (key = randomUUID(), value = input) => placeCombinedBet(db, user, value, key),
  };
}
test('a combined ticket debits once, locks every match, freezes each quote and pays once after all wins', (t) => {
  const f = setup(t),
    key = randomUUID(),
    ticket = f.place(key);
  assert.equal(ticket.kind, 'COMBO');
  assert.equal(ticket.odds, 3.65);
  assert.equal(ticket.selections.length, 2);
  assert.equal(f.balance(), 900);
  assert.equal(f.place(key).id, ticket.id);
  assert.equal(f.balance(), 900);
  assert.ok(hasMatchBets(f.db, f.matches[1]));
  f.db.prepare('UPDATE matches SET oddsHome=500').run();
  f.started();
  f.finish(f.matches[0]);
  assert.equal(f.balance(), 900);
  assert.equal(f.db.prepare('SELECT status FROM bets WHERE id=?').get(ticket.id).status, 'PENDING');
  f.finish(f.matches[1]);
  f.finish(f.matches[1]);
  assert.equal(f.balance(), 1265);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger WHERE reason='BET_PAYOUT'").get().n, 1);
  assert.equal(f.place(key).id, ticket.id);
});
test('a void leg is removed from the winning combined price, and all void legs refund the single stake', (t) => {
  const f = setup(t),
    ticket = f.place();
  cancelMatch(f.db, f.user, f.matches[1], 'Match annulé pour test');
  assert.equal(f.balance(), 900);
  f.started();
  f.finish(f.matches[0]);
  assert.equal(f.balance(), 1091);
  assert.equal(f.db.prepare('SELECT payout FROM bets WHERE id=?').get(ticket.id).payout, 191);
});
test('fully void tickets refund once while a losing ticket stays lost after remaining void legs', (t) => {
  const f = setup(t),
    ticket = f.place();
  cancelMatch(f.db, f.user, f.matches[0], 'Match annulé pour test');
  cancelMatch(f.db, f.user, f.matches[1], 'Match annulé pour test');
  cancelMatch(f.db, f.user, f.matches[1], 'Match annulé pour test');
  assert.equal(f.balance(), 1000);
  assert.equal(f.db.prepare('SELECT status FROM bets WHERE id=?').get(ticket.id).status, 'VOID');
});
test('one losing leg resolves the ticket without paying or refunding remaining legs', (t) => {
  const f = setup(t),
    ticket = f.place();
  f.started();
  f.finish(f.matches[1], false);
  assert.equal(f.db.prepare('SELECT status FROM bets WHERE id=?').get(ticket.id).status, 'LOST');
  cancelMatch(f.db, f.user, f.matches[0], 'Match annulé pour test');
  assert.equal(f.balance(), 900);
});
test('duplicates, stale prices, closed matches and idempotency collisions do not debit', (t) => {
  const f = setup(t);
  assert.throws(
    () =>
      f.place(randomUUID(), {
        ...f.input,
        selections: [f.input.selections[0], f.input.selections[0]],
      }),
    /distinctes/,
  );
  assert.throws(
    () =>
      f.place(randomUUID(), {
        ...f.input,
        selections: [f.input.selections[0], { ...f.input.selections[1], odds: 9 }],
      }),
    /cote/,
  );
  assert.equal(f.balance(), 1000);
  const key = randomUUID();
  f.place(key);
  assert.throws(() => f.place(key, { ...f.input, amount: 101 }), /autre pari/);
  f.started();
  assert.throws(() => f.place(), /commencé/);
  assert.equal(f.balance(), 900);
});
test('failed combined payouts roll the match, legs and ticket back atomically', (t) => {
  const f = setup(t),
    ticket = f.place();
  f.started();
  f.finish(f.matches[0]);
  f.db.exec(
    "CREATE TRIGGER fail_combo BEFORE INSERT ON ledger WHEN NEW.reason='BET_PAYOUT' BEGIN SELECT RAISE(ABORT,'test payout failure'); END;",
  );
  assert.throws(() => f.finish(f.matches[1]), /test payout/);
  assert.equal(f.db.prepare('SELECT status FROM bets WHERE id=?').get(ticket.id).status, 'PENDING');
  assert.equal(
    f.db
      .prepare('SELECT status FROM bet_legs WHERE betId=? AND matchId=?')
      .get(ticket.id, f.matches[1]).status,
    'PENDING',
  );
  assert.equal(
    f.db.prepare('SELECT status FROM matches WHERE id=?').get(f.matches[1]).status,
    'UPCOMING',
  );
  assert.equal(f.balance(), 900);
});
