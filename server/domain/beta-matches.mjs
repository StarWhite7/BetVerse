import { randomUUID } from 'node:crypto';
import { ensure, transaction } from '../lib/errors.mjs';
import { audit, now } from './accounts.mjs';

// Transcription of the user's screenshot. The first two live fixtures are excluded.
export const betaMatches = [
  ['Slavia Prague', 'Arsenal FC', 1100, 560, 127],
  ['PSV Eindhoven', 'Club Brugge', 189, 440, 340],
  ['RC Lens', 'Como 1907', 370, 390, 191],
  ['Viking FK', 'Sabah Masazir', 149, 480, 580],
  ['RB Leipzig', 'Manchester City', 500, 480, 155],
  ['Borussia Dortmund', 'Real Betis Seville', 164, 420, 480],
  ['FC Porto', 'SSC Napoli', 197, 360, 375],
];

export function importBetaMatches(db, adminUsername, scheduledAt) {
  ensure(
    typeof scheduledAt === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(scheduledAt),
    400,
    'Un horaire ISO avec fuseau explicite est requis.',
  );
  const timestamp = Date.parse(scheduledAt);
  ensure(
    Number.isFinite(timestamp) && timestamp > Date.now(),
    400,
    'L’horaire de recette doit être futur.',
  );
  const startDate = new Date(timestamp).toISOString();
  const competition = 'Recette — UEFA Champions League';
  return transaction(db, () => {
    const actor = db
      .prepare("SELECT id FROM users WHERE username=? AND role='ADMIN'")
      .get(adminUsername);
    ensure(actor, 403, 'Compte administrateur existant requis. Aucun compte créé ou promu.');
    const result = [];
    for (const [homeTeam, awayTeam, oddsHome, oddsDraw, oddsAway] of betaMatches) {
      const existing = db
        .prepare(
          'SELECT * FROM matches WHERE homeTeam=? AND awayTeam=? AND startDate=? AND competition=?',
        )
        .all(homeTeam, awayTeam, startDate, competition);
      ensure(
        existing.length <= 1,
        409,
        'Doublons existants : import interrompu sans modification.',
      );
      if (existing.length) {
        const row = existing[0];
        ensure(
          row.status === 'UPCOMING' &&
            row.oddsHome === oddsHome &&
            row.oddsDraw === oddsDraw &&
            row.oddsAway === oddsAway,
          409,
          'Une rencontre existante a été modifiée : aucune cote écrasée.',
        );
        result.push({ id: row.id, homeTeam, awayTeam, created: false });
        continue;
      }
      const id = randomUUID();
      db.prepare(
        'INSERT INTO matches (id,homeTeam,awayTeam,startDate,oddsHome,oddsAway,oddsDraw,competition,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      ).run(id, homeTeam, awayTeam, startDate, oddsHome, oddsAway, oddsDraw, competition, now());
      audit(db, actor.id, 'BETA_MATCH_CREATED', id, { source: 'user-screenshot', startDate });
      result.push({ id, homeTeam, awayTeam, created: true });
    }
    return result;
  });
}
