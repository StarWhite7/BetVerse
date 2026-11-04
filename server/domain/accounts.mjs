import { randomUUID } from 'node:crypto';
import { transaction, ensure } from '../lib/errors.mjs';
export const now = () => new Date().toISOString();
export function levelForXp(xp, base = 500, growth = 250) {
  return (
    Math.floor(
      (-(base - growth / 2) + Math.sqrt((base - growth / 2) ** 2 + 2 * growth * xp)) / growth,
    ) + 1
  );
}
export function publicUser(db, userId) {
  const user = db
    .prepare('SELECT id,email,username,role,xp,createdAt FROM users WHERE id=?')
    .get(userId);
  ensure(user, 404, 'Utilisateur introuvable.');
  return {
    ...user,
    level: levelForXp(user.xp),
    agencyId:
      db.prepare('SELECT agencyId FROM memberships WHERE userId=?').get(userId)?.agencyId ?? null,
  };
}
export function createUser(
  db,
  { email, username, passwordHash, role = 'USER', emailVerified = true },
) {
  return transaction(db, () => {
    const userId = randomUUID(),
      timestamp = now();
    db.prepare(
      'INSERT INTO users (id,email,username,passwordHash,role,createdAt,emailVerified) VALUES (?,?,?,?,?,?,?)',
    ).run(userId, email, username, passwordHash, role, timestamp, emailVerified ? 1 : 0);
    db.prepare('INSERT INTO wallets (id,userId,createdAt,updatedAt) VALUES (?,?,?,?)').run(
      randomUUID(),
      userId,
      timestamp,
      timestamp,
    );
    return publicUser(db, userId);
  });
}
export function wallet(db, userId) {
  const row = db.prepare('SELECT * FROM wallets WHERE userId=?').get(userId);
  ensure(row, 404, 'Portefeuille introuvable.');
  const { lastClaimAt, ...rest } = row;
  const serverTime = Date.now();
  return {
    ...rest,
    serverTime: new Date(serverTime).toISOString(),
    nextClaimAvailableAt:
      lastClaimAt && lastClaimAt + 86400000 > serverTime
        ? new Date(lastClaimAt + 86400000).toISOString()
        : null,
  };
}
// Call only inside an existing transaction. Integer Verse; no currency conversions.
export function movement(db, userId, amount, type, reason, reference) {
  ensure(Number.isSafeInteger(amount) && amount > 0, 400, 'Montant invalide.');
  const delta = type === 'CREDIT' ? amount : -amount;
  const changed = db
    .prepare(
      'UPDATE wallets SET balance=balance+?, updatedAt=? WHERE userId=? AND balance+? BETWEEN 0 AND 1000000000000',
    )
    .run(delta, now(), userId, delta);
  ensure(changed.changes === 1, 409, 'Solde insuffisant ou plafond du portefeuille atteint.');
  db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?)').run(
    randomUUID(),
    userId,
    amount,
    type,
    reason,
    reference,
    now(),
  );
}
export function notify(
  db,
  userId,
  type,
  title,
  message,
  metadata = null,
  agencyId = null,
  inviteId = null,
) {
  db.prepare(
    'INSERT INTO notifications (id,userId,type,title,message,metadata,agencyId,inviteId,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    randomUUID(),
    userId,
    type,
    title,
    message,
    metadata ? JSON.stringify(metadata) : null,
    agencyId,
    inviteId,
    now(),
  );
}
export function audit(db, actorId, action, targetId = null, details = {}) {
  db.prepare('INSERT INTO audit_log VALUES (?,?,?,?,?,?)').run(
    randomUUID(),
    actorId,
    action,
    targetId,
    JSON.stringify(details),
    now(),
  );
}
export function playerStats(db, userId) {
  const result = db
    .prepare(
      `SELECT COUNT(*) betsPlayed,
    COALESCE(SUM(status='WON'),0) betsWon,
    COALESCE(SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END),0) versePending,
    COALESCE(SUM(CASE WHEN status='WON' THEN payout ELSE 0 END),0) verseEarned,
    COALESCE(SUM(status IN ('WON','LOST')),0) settled FROM bets WHERE userId=?`,
    )
    .get(userId);
  const verseWallet = wallet(db, userId).balance;
  let currentStreak = 0;
  for (const bet of db
    .prepare(
      "SELECT status FROM bets WHERE userId=? AND status IN ('WON','LOST') ORDER BY resolvedAt DESC,id DESC",
    )
    .all(userId)) {
    if (bet.status !== 'WON') break;
    currentStreak++;
  }
  return {
    ...result,
    verseWallet,
    versePossessedTotal: verseWallet + result.versePending,
    verseInvested: 0,
    winRate: result.settled ? Math.round((result.betsWon / result.settled) * 10000) / 100 : 0,
    currentStreak,
  };
}
