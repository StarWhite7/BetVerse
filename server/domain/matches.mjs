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
export function betDto(row, db) {
  return {
    ...row,
    odds: row.odds / 100,
    ...(row.kind === 'COMBO' && db
      ? {
          selections: db
            .prepare(
              'SELECT matchId,match,betType,odds,status FROM bet_legs WHERE betId=? ORDER BY position',
            )
            .all(row.id)
            .map((leg) => ({ ...leg, odds: leg.odds / 100 })),
        }
      : {}),
  };
}
export function hasMatchBets(db, matchId) {
  return Boolean(
    db
      .prepare(
        'SELECT 1 FROM bets WHERE matchId=? UNION ALL SELECT 1 FROM bet_legs WHERE matchId=? LIMIT 1',
      )
      .get(matchId, matchId),
  );
}
function combinedOdds(legs) {
  const product = legs.reduce((value, leg) => value * BigInt(leg.odds), 1n);
  const divisor = 100n ** BigInt(Math.max(0, legs.length - 1));
  return Number((product + divisor / 2n) / divisor);
}

export function correctBetStatus(db, actorId, betId, { expectedStatus, outcome, reason }) {
  const bet = db.prepare('SELECT * FROM bets WHERE id=?').get(betId);
  ensure(bet, 404, 'Pari introuvable.');
  ensure(bet.status === expectedStatus, 409, 'Le statut du pari a changé. Actualisez la liste.');
  if (outcome === 'DRAW') {
    const match = db.prepare('SELECT sportKey FROM matches WHERE id=?').get(bet.matchId);
    ensure(
      bet.kind === 'SINGLE' && match?.sportKey === 'football',
      400,
      'Le match nul s’applique à un pari simple 1N2. Pour un combiné, clôturez la rencontre concernée.',
    );
  }
  const status = outcome === 'DRAW' ? (bet.betType === 'DRAW' ? 'WON' : 'LOST') : outcome;
  if (status === bet.status) return;

  let effectiveOdds = bet.odds;
  if (status === 'WON' && bet.kind === 'COMBO') {
    const legs = db
      .prepare("SELECT odds FROM bet_legs WHERE betId=? AND status!='VOID'")
      .all(betId);
    ensure(legs.length, 409, 'Toutes les sélections ont été annulées. Remboursez le ticket.');
    effectiveOdds = combinedOdds(legs);
  }
  const payout =
    status === 'WON'
      ? Number((BigInt(bet.amount) * BigInt(effectiveOdds) + 50n) / 100n)
      : status === 'VOID'
        ? bet.amount
        : 0;
  const delta = payout - (bet.payout || 0);
  if (delta) {
    movement(
      db,
      bet.userId,
      Math.abs(delta),
      delta > 0 ? 'CREDIT' : 'DEBIT',
      'BET_ADMIN_CORRECTION',
      randomUUID(),
    );
  }
  const xp = (Number(status === 'WON') - Number(bet.status === 'WON')) * 50;
  if (xp) db.prepare('UPDATE users SET xp=MAX(0,xp+?) WHERE id=?').run(xp, bet.userId);
  db.prepare('UPDATE bets SET status=?,payout=?,resolvedAt=? WHERE id=?').run(
    status,
    status === 'PENDING' ? null : payout,
    status === 'PENDING' ? null : now(),
    betId,
  );
  audit(db, actorId, 'BET_STATUS_CORRECTED', betId, {
    userId: bet.userId,
    before: bet.status,
    after: status,
    outcome,
    reason,
    delta,
  });
  notify(
    db,
    bet.userId,
    'BET_CORRECTED',
    'Statut du pari mis à jour',
    'Le statut de votre ticket a été corrigé. Retrouvez le détail dans Mes paris.',
    { betId, status, payout, delta },
  );
}

export function placeCombinedBet(db, userId, input, requestKey) {
  return transaction(db, () => {
    ensure(
      input.selections.length >= 2 &&
        input.selections.length <= 10 &&
        new Set(input.selections.map((s) => s.matchId)).size === input.selections.length,
      400,
      'Un combiné comprend 2 à 10 rencontres distinctes.',
    );
    const requestHash = digest(
      JSON.stringify([
        'COMBO',
        input.amount,
        input.selections.map((s) => [s.matchId, s.betType, s.odds]),
      ]),
    );
    const previous = db
      .prepare('SELECT * FROM bets WHERE userId=? AND requestKey=?')
      .get(userId, requestKey);
    if (previous) {
      ensure(
        previous.requestHash === requestHash,
        409,
        'Cette clé de requête a déjà été utilisée pour un autre pari.',
      );
      return betDto(previous, db);
    }
    const legs = input.selections.map((selection) => {
      const match = db.prepare('SELECT * FROM matches WHERE id=?').get(selection.matchId);
      ensure(
        match && match.status === 'UPCOMING' && Date.parse(match.startDate) > Date.now(),
        409,
        'Une rencontre du combiné est indisponible ou a commencé.',
      );
      const odds = { HOME: match.oddsHome, AWAY: match.oddsAway, DRAW: match.oddsDraw }[
        selection.betType
      ];
      ensure(
        odds != null && Math.round(selection.odds * 100) === odds,
        409,
        'Une cote a changé. Actualisez les matchs et vérifiez votre combiné.',
      );
      return {
        matchId: match.id,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        betType: selection.betType,
        odds,
      };
    });
    const odds = combinedOdds(legs);
    ensure(
      Number.isSafeInteger(odds) && odds <= 100000000,
      400,
      'La cote totale maximale est de 1 000 000. Réduisez votre combiné.',
    );
    const betId = randomUUID();
    movement(db, userId, input.amount, 'DEBIT', 'BET_STAKE', betId);
    db.prepare(
      "INSERT INTO bets (id,userId,matchId,match,betType,amount,odds,createdAt,requestKey,requestHash,kind) VALUES (?,?,?,?,?,?,?,?,?,?,'COMBO')",
    ).run(
      betId,
      userId,
      legs[0].matchId,
      `Combiné · ${legs.length} rencontres`,
      legs[0].betType,
      input.amount,
      odds,
      now(),
      requestKey,
      requestHash,
    );
    const insert = db.prepare(
      'INSERT INTO bet_legs (betId,matchId,match,betType,odds,position) VALUES (?,?,?,?,?,?)',
    );
    legs.forEach((leg, index) =>
      insert.run(betId, leg.matchId, leg.match, leg.betType, leg.odds, index),
    );
    db.prepare('UPDATE users SET xp=xp+10 WHERE id=?').run(userId);
    return betDto(db.prepare('SELECT * FROM bets WHERE id=?').get(betId), db);
  });
}
function settleCombined(db, matchId, result) {
  const timestamp = now();
  db.prepare(
    "UPDATE bet_legs SET status=CASE WHEN ? IS NULL THEN 'VOID' WHEN betType=? THEN 'WON' ELSE 'LOST' END WHERE matchId=? AND status='PENDING'",
  ).run(result, result, matchId);
  const tickets = db
    .prepare(
      "SELECT b.* FROM bets b JOIN bet_legs l ON l.betId=b.id WHERE l.matchId=? AND b.status='PENDING'",
    )
    .all(matchId);
  for (const bet of tickets) {
    const legs = db.prepare('SELECT * FROM bet_legs WHERE betId=? ORDER BY position').all(bet.id);
    let status;
    if (legs.some((leg) => leg.status === 'LOST')) status = 'LOST';
    else if (legs.some((leg) => leg.status === 'PENDING')) continue;
    else status = legs.every((leg) => leg.status === 'VOID') ? 'VOID' : 'WON';
    const effective = legs.filter((leg) => leg.status !== 'VOID');
    const effectiveOdds = effective.length ? combinedOdds(effective) : 100;
    const payout =
      status === 'LOST'
        ? 0
        : status === 'VOID'
          ? bet.amount
          : Number((BigInt(bet.amount) * BigInt(effectiveOdds) + 50n) / 100n);
    db.prepare('UPDATE bets SET status=?,payout=?,resolvedAt=? WHERE id=?').run(
      status,
      payout,
      timestamp,
      bet.id,
    );
    if (payout) {
      movement(
        db,
        bet.userId,
        payout,
        'CREDIT',
        status === 'VOID' ? 'BET_REFUND' : 'BET_PAYOUT',
        bet.id,
      );
      if (status === 'WON') db.prepare('UPDATE users SET xp=xp+50 WHERE id=?').run(bet.userId);
      notify(
        db,
        bet.userId,
        status === 'VOID' ? 'BET_REFUNDED' : 'BET_WON',
        status === 'VOID' ? 'Combiné remboursé' : 'Combiné gagnant',
        `Votre ticket "${bet.match}" : +${payout} Verse.`,
        { amount: bet.amount, payout, effectiveOdds: effectiveOdds / 100 },
      );
    }
  }
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
      .prepare("SELECT * FROM bets WHERE matchId=? AND status='PENDING' AND kind='SINGLE'")
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
    settleCombined(db, matchId, result);
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
      .prepare("SELECT * FROM bets WHERE matchId=? AND status='PENDING' AND kind='SINGLE'")
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
    settleCombined(db, matchId, null);
    db.prepare('UPDATE votes SET resolvedAt=? WHERE matchId=? AND resolvedAt IS NULL').run(
      timestamp,
      matchId,
    );
    audit(db, actorId, 'MATCH_CANCELLED', matchId, { reason });
    return matchDto(db.prepare('SELECT * FROM matches WHERE id=?').get(matchId));
  });
}
