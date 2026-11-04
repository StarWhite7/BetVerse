import { randomUUID } from 'node:crypto';
import { digest } from '../lib/security.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { movement, notify, now, audit } from './accounts.mjs';
export function matchDto(row) {
  return {
    ...row,
    status:
      row.status === 'UPCOMING' && Date.parse(row.startDate) <= Date.now() ? 'LIVE' : row.status,
    oddsHome: row.oddsHome / 100,
    oddsAway: row.oddsAway / 100,
    oddsDraw: row.oddsDraw === null ? null : row.oddsDraw / 100,
    league: row.competition,
  };
}
export function betDto(row) {
  return { ...row, odds: row.odds / 100 };
}
export function placeBet(db, userId, input, requestKey) {
  return transaction(db, () => {
    const requestHash = digest(JSON.stringify([input.matchId, input.betType, input.amount]));
    const previous = db
      .prepare('SELECT * FROM bets WHERE userId=? AND requestKey=?')
      .get(userId, requestKey);
    if (previous) {
      ensure(
        previous.requestHash === requestHash,
        409,
        'Cette clé de requête a déjà été utilisée pour un autre pari.',
      );
      return betDto(previous);
    }
    const match = db.prepare('SELECT * FROM matches WHERE id=?').get(input.matchId);
    ensure(match, 404, 'Match introuvable.');
    ensure(
      match.status === 'UPCOMING' && Date.parse(match.startDate) > Date.now(),
      409,
      'Les paris sont fermés pour cette rencontre.',
    );
    const odds = { HOME: match.oddsHome, AWAY: match.oddsAway, DRAW: match.oddsDraw }[
      input.betType
    ];
    ensure(odds !== null, 400, 'Ce type de pari est indisponible.');
    // Reject stale quotes. Never use a client supplied quote for settlement.
    ensure(
      input.odds === undefined || Math.round(input.odds * 100) === odds,
      409,
      'La cote a changé. Actualisez les matchs.',
    );
    const betId = randomUUID();
    movement(db, userId, input.amount, 'DEBIT', 'BET_STAKE', betId);
    db.prepare(
      `INSERT INTO bets (id,userId,matchId,match,betType,amount,odds,createdAt,requestKey,requestHash) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      betId,
      userId,
      match.id,
      `${match.homeTeam} vs ${match.awayTeam}`,
      input.betType,
      input.amount,
      odds,
      now(),
      requestKey,
      requestHash,
    );
    db.prepare('UPDATE users SET xp=xp+10 WHERE id=?').run(userId);
    return betDto(db.prepare('SELECT * FROM bets WHERE id=?').get(betId));
  });
}
export function finishMatch(db, actorId, matchId, { result, homeScore, awayScore }) {
  return transaction(db, () => {
    const match = db.prepare('SELECT * FROM matches WHERE id=?').get(matchId);
    ensure(match, 404, 'Match introuvable.');
    ensure(match.status !== 'CANCELLED', 409, 'Une rencontre annulée ne peut pas être clôturée.');
    if (match.status === 'FINISHED') {
      ensure(
        match.result === result && match.homeScore === homeScore && match.awayScore === awayScore,
        409,
        'Ce match a déjà été clôturé avec un autre résultat.',
      );
      return matchDto(match);
    }
    ensure(
      Date.parse(match.startDate) <= Date.now(),
      409,
      'Une rencontre future ne peut pas être clôturée.',
    );
    const expected = homeScore === awayScore ? 'DRAW' : homeScore > awayScore ? 'HOME' : 'AWAY';
    ensure(result === expected, 400, 'Le résultat ne correspond pas au score.');
    const timestamp = now();
    db.prepare(
      "UPDATE matches SET status='FINISHED',result=?,homeScore=?,awayScore=? WHERE id=?",
    ).run(result, homeScore, awayScore, matchId);
    for (const bet of db
      .prepare("SELECT * FROM bets WHERE matchId=? AND status='PENDING'")
      .all(matchId)) {
      const won = bet.betType === result;
      const payout = won ? Math.floor((bet.amount * bet.odds + 50) / 100) : 0;
      db.prepare('UPDATE bets SET status=?,payout=?,resolvedAt=? WHERE id=?').run(
        won ? 'WON' : 'LOST',
        payout,
        timestamp,
        bet.id,
      );
      if (won) {
        movement(db, bet.userId, payout, 'CREDIT', 'BET_PAYOUT', bet.id);
        db.prepare('UPDATE users SET xp=xp+50 WHERE id=?').run(bet.userId);
        notify(
          db,
          bet.userId,
          'BET_WON',
          'Pari gagnant',
          `Votre ticket "${bet.match}" est gagnant. +${payout} Verse.`,
          {
            match: bet.match,
            betType: bet.betType,
            amount: bet.amount,
            odds: bet.odds / 100,
            payout,
          },
        );
      }
    }
    for (const vote of db
      .prepare('SELECT * FROM votes WHERE matchId=? AND resolvedAt IS NULL')
      .all(matchId)) {
      const predicted =
        vote.homeScore === vote.awayScore
          ? 'DRAW'
          : vote.homeScore > vote.awayScore
            ? 'HOME'
            : 'AWAY';
      const points =
        vote.homeScore === homeScore && vote.awayScore === awayScore
          ? 3
          : predicted === result
            ? 1
            : 0;
      db.prepare('UPDATE votes SET points=?,resolvedAt=? WHERE userId=? AND matchId=?').run(
        points,
        timestamp,
        vote.userId,
        matchId,
      );
    }
    const groups = db.prepare('SELECT DISTINCT agencyId FROM votes WHERE matchId=?').all(matchId);
    for (const { agencyId } of groups) {
      // Collective prediction is the most common score; ties resolved by score order.
      const vote = db
        .prepare(
          'SELECT homeScore,awayScore,COUNT(*) n FROM votes WHERE agencyId=? AND matchId=? GROUP BY homeScore,awayScore ORDER BY n DESC,homeScore,awayScore LIMIT 1',
        )
        .get(agencyId, matchId);
      const predicted =
        vote.homeScore === vote.awayScore
          ? 'DRAW'
          : vote.homeScore > vote.awayScore
            ? 'HOME'
            : 'AWAY';
      const points =
        vote.homeScore === homeScore && vote.awayScore === awayScore
          ? 3
          : predicted === result
            ? 1
            : 0;
      db.prepare('INSERT INTO agency_results VALUES (?,?,?,?)').run(
        agencyId,
        matchId,
        points,
        timestamp,
      );
      db.prepare(
        'UPDATE agencies SET xp=xp+?,trophiesCount=trophiesCount+?,updatedAt=? WHERE id=?',
      ).run(points * 100, points === 3 ? 1 : 0, timestamp, agencyId);
      const total = db
        .prepare('SELECT COALESCE(SUM(points),0) n FROM agency_results WHERE agencyId=?')
        .get(agencyId).n;
      if (total >= 10) {
        const reward = db
          .prepare("INSERT OR IGNORE INTO agency_mission_rewards VALUES (?,'first-ten-points',?)")
          .run(agencyId, timestamp);
        if (reward.changes)
          db.prepare('UPDATE agencies SET xp=xp+500,trophiesCount=trophiesCount+1 WHERE id=?').run(
            agencyId,
          );
      }
    }
    audit(db, actorId, 'MATCH_FINISHED', matchId, { result, homeScore, awayScore });
    return matchDto(db.prepare('SELECT * FROM matches WHERE id=?').get(matchId));
  });
}
export function cancelMatch(db, actorId, matchId, reason) {
  return transaction(db, () => {
    const match = db.prepare('SELECT * FROM matches WHERE id=?').get(matchId);
    ensure(match, 404, 'Match introuvable.');
    if (match.status === 'CANCELLED') return matchDto(match);
    ensure(match.status !== 'FINISHED', 409, 'Un match déjà réglé ne peut pas être annulé.');
    const timestamp = now();
    db.prepare("UPDATE matches SET status='CANCELLED',cancellationReason=? WHERE id=?").run(
      reason,
      matchId,
    );
    for (const bet of db
      .prepare("SELECT * FROM bets WHERE matchId=? AND status='PENDING'")
      .all(matchId)) {
      movement(db, bet.userId, bet.amount, 'CREDIT', 'BET_REFUND', bet.id);
      db.prepare("UPDATE bets SET status='VOID',payout=amount,resolvedAt=? WHERE id=?").run(
        timestamp,
        bet.id,
      );
      notify(
        db,
        bet.userId,
        'BET_REFUNDED',
        'Pari remboursé',
        `La rencontre "${bet.match}" a été annulée. Votre mise de ${bet.amount} Verse a été remboursée.`,
        { match: bet.match, amount: bet.amount, payout: bet.amount },
      );
    }
    db.prepare('UPDATE votes SET resolvedAt=? WHERE matchId=? AND resolvedAt IS NULL').run(
      timestamp,
      matchId,
    );
    audit(db, actorId, 'MATCH_CANCELLED', matchId, { reason });
    return matchDto(db.prepare('SELECT * FROM matches WHERE id=?').get(matchId));
  });
}
