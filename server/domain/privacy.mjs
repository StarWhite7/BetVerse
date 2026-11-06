import { transaction, ensure } from '../lib/errors.mjs';
import { verifyPassword, digest } from '../lib/security.mjs';
import { betDto } from './matches.mjs';
import { audit, now } from './accounts.mjs';

export function exportAccount(db, userId) {
  const account = db
    .prepare('SELECT id,email,username,role,xp,createdAt,status FROM users WHERE id=?')
    .get(userId);
  ensure(account, 404, 'Compte introuvable.');
  return {
    exportedAt: now(),
    account,
    wallet: db.prepare('SELECT balance,shards,createdAt FROM wallets WHERE userId=?').get(userId),
    bets: db
      .prepare(
        'SELECT id,matchId,match,betType,amount,odds,status,payout,createdAt,resolvedAt,kind FROM bets WHERE userId=? ORDER BY createdAt',
      )
      .all(userId)
      .map((row) => betDto(row, db)),
    movements: db
      .prepare(
        'SELECT id,amount,type,reason,reference,createdAt FROM ledger WHERE userId=? ORDER BY createdAt',
      )
      .all(userId),
    membership:
      db.prepare('SELECT agencyId,role,joinedAt FROM memberships WHERE userId=?').get(userId) ||
      null,
    votes: db
      .prepare('SELECT agencyId,matchId,homeScore,awayScore,points FROM votes WHERE userId=?')
      .all(userId),
    notifications: db
      .prepare('SELECT type,title,message,readAt,createdAt FROM notifications WHERE userId=?')
      .all(userId),
    preferences: db
      .prepare('SELECT bets,agencies,push FROM user_preferences WHERE userId=?')
      .get(userId) || { bets: 1, agencies: 1, push: 0 },
    pushDevices: db
      .prepare('SELECT updatedAt FROM push_devices WHERE userId=? ORDER BY updatedAt')
      .all(userId),
  };
}
export async function deleteAccount(db, userId, password) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  ensure(
    user && (await verifyPassword(password, user.passwordHash)),
    403,
    'Mot de passe incorrect.',
  );
  return transaction(db, () => {
    ensure(
      db.prepare('SELECT passwordHash FROM users WHERE id=?').get(userId)?.passwordHash ===
        user.passwordHash,
      409,
      'Votre compte a changé. Reconnectez-vous.',
    );
    ensure(
      user.role !== 'ADMIN' ||
        db
          .prepare("SELECT COUNT(*) n FROM users WHERE role='ADMIN' AND status='ACTIVE' AND id!=?")
          .get(userId).n > 0,
      409,
      'Transmettez l’administration à un autre compte avant de supprimer le dernier administrateur.',
    );
    return eraseAccountData(db, userId);
  });
}
// Internal erasure primitive shared by authenticated deletion and offline restore only.
// A restore must honor committed receipts even if that removes its last historical admin.
export function eraseAccountData(db, userId) {
  return transaction(db, () => {
    if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId)) return { success: true };
    db.prepare('INSERT OR IGNORE INTO erasure_receipts(subjectHash,deletedAt) VALUES (?,?)').run(
      digest(userId),
      now(),
    );
    const membership = db.prepare('SELECT * FROM memberships WHERE userId=?').get(userId);
    if (membership?.role === 'DIRECTEUR') {
      const successor = db
        .prepare(
          'SELECT userId FROM memberships WHERE agencyId=? AND userId!=? ORDER BY joinedAt,userId LIMIT 1',
        )
        .get(membership.agencyId, userId);
      if (successor) {
        db.prepare("UPDATE memberships SET role='MEMBRE' WHERE userId=?").run(userId);
        db.prepare("UPDATE memberships SET role='DIRECTEUR' WHERE userId=?").run(successor.userId);
      } else {
        db.prepare('DELETE FROM notifications WHERE agencyId=?').run(membership.agencyId);
        db.prepare('DELETE FROM agencies WHERE id=?').run(membership.agencyId);
      }
    }
    db.prepare(
      'DELETE FROM notifications WHERE inviteId IN (SELECT id FROM invitations WHERE userId=? OR inviterId=?)',
    ).run(userId, userId);
    db.prepare('DELETE FROM invitations WHERE userId=? OR inviterId=?').run(userId, userId);
    db.prepare('DELETE FROM bet_legs WHERE betId IN (SELECT id FROM bets WHERE userId=?)').run(
      userId,
    );
    for (const table of [
      'bets',
      'ledger',
      'wallet_commands',
      'votes',
      'notifications',
      'memberships',
      'sessions',
      'password_resets',
      'email_verifications',
      'user_preferences',
      'wallets',
    ])
      db.prepare(`DELETE FROM ${table} WHERE userId=?`).run(userId);
    // Remove subject identifiers from prior admin records without retaining the person's identity.
    db.prepare(
      "UPDATE audit_log SET actorId=NULL,targetId=NULL,details='{}' WHERE actorId=? OR targetId=? OR instr(details,?)>0",
    ).run(userId, userId, userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
    audit(db, null, 'ACCOUNT_DELETED', null, { erased: true });
    return { success: true };
  });
}
