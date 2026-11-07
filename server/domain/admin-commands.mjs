import { digest } from '../lib/security.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { now } from './accounts.mjs';

// Persist the receipt with the mutation so retrying a lost response never applies it twice.
export function adminCommand(db, actorId, key, scope, input, action) {
  return transaction(db, () => {
    const hash = digest(JSON.stringify([scope, input]));
    const previous = db
      .prepare('SELECT requestHash FROM wallet_commands WHERE userId=? AND requestKey=?')
      .get(actorId, key);
    if (previous) {
      ensure(previous.requestHash === hash, 409, 'Clé de requête déjà utilisée.');
      return;
    }
    action();
    db.prepare('INSERT INTO wallet_commands VALUES (?,?,?,?)').run(actorId, key, hash, now());
  });
}
