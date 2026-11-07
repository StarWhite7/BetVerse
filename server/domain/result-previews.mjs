import { randomUUID } from 'node:crypto';
import { ensure } from '../lib/errors.mjs';

export function createResultPreview(db, actorId, rows) {
  ensure(
    Array.isArray(rows) &&
      rows.length >= 1 &&
      rows.length <= 100 &&
      new Set(rows.map((r) => r.matchId)).size === rows.length,
    400,
    'Une ligne par rencontre (100 maximum).',
  );
  const preview = rows.map((row) => {
    ensure(
      [row.homeScore, row.awayScore].every((n) => Number.isInteger(n) && n >= 0 && n <= 200),
      400,
      'Score invalide.',
    );
    const match = db
      .prepare('SELECT id,homeTeam,awayTeam,startDate,status FROM matches WHERE id=?')
      .get(row.matchId);
    ensure(
      match &&
        ['UPCOMING', 'LIVE'].includes(match.status) &&
        Date.parse(match.startDate) <= Date.now(),
      409,
      'Une rencontre est absente, future ou déjà réglée.',
    );
    return {
      ...row,
      ...match,
      result:
        row.homeScore === row.awayScore ? 'DRAW' : row.homeScore > row.awayScore ? 'HOME' : 'AWAY',
    };
  });
  const id = randomUUID();
  db.prepare('INSERT INTO result_previews(id,actorId,createdAt,rows) VALUES (?,?,?,?)').run(
    id,
    actorId,
    new Date(Date.now()).toISOString(),
    JSON.stringify(preview),
  );
  return { id, rows: preview, expiresIn: 900, providerCredits: 0, applied: false };
}
