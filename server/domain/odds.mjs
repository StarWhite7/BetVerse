import { randomUUID } from 'node:crypto';
import { ensure, AppError, transaction } from '../lib/errors.mjs';
import { audit, now } from './accounts.mjs';
import { hasMatchBets } from './matches.mjs';

export const COMPETITIONS = Object.freeze({
  soccer_france_ligue_one: 'Ligue 1',
  soccer_epl: 'Premier League',
  soccer_spain_la_liga: 'La Liga',
  soccer_italy_serie_a: 'Serie A',
  soccer_germany_bundesliga: 'Bundesliga',
  soccer_uefa_champs_league: 'Ligue des champions',
  soccer_uefa_europa_league: 'Ligue Europa',
  soccer_uefa_europa_conference_league: 'Ligue Conférence',
  soccer_fifa_world_cup: 'Coupe du monde',
  soccer_uefa_european_championship: 'Euro',
});
export const BOOKMAKERS = Object.freeze({
  betclic_fr: 'Betclic France',
  winamax_fr: 'Winamax France',
  unibet_fr: 'Unibet France',
});
const HOUR = 3600000;
const DAY = 24 * HOUR;
const MAX_BYTES = 4 * 1024 * 1024;
const has = (object, key) => Object.hasOwn(object, key);
const headerInteger = (response, name) => {
  const value = response.headers.get(name);
  return value !== null && /^\d{1,9}$/.test(value) ? Number(value) : null;
};

// No startup, GET, publication, retry, pagination or fallback ever calls a provider.
export function manualOdds({ db, config }) {
  const ready = () => config.oddsMode === 'manual' && Boolean(config.oddsKey);
  const usage = () => {
    const latest = db
      .prepare(
        "SELECT * FROM odds_calls WHERE state!='CACHED' ORDER BY createdAt DESC,rowid DESC LIMIT 1",
      )
      .get();
    const quota = db
      .prepare(
        'SELECT remaining,createdAt FROM odds_calls WHERE remaining IS NOT NULL ORDER BY createdAt DESC,rowid DESC LIMIT 1',
      )
      .get();
    const count = (since) =>
      db
        .prepare("SELECT COUNT(*) n FROM odds_calls WHERE state!='CACHED' AND createdAt>?")
        .get(since).n;
    return {
      mode: config.oddsMode || 'disabled',
      configured: ready(),
      dailyUsed: count(Date.now() - DAY),
      dailyLimit: config.oddsDailyLimit || 10,
      monthlyUsed: count(Date.now() - 31 * DAY),
      monthlyLimit: config.oddsMonthlyLimit || 400,
      providerRemaining: quota?.remaining ?? null,
      providerCheckedAt: quota?.createdAt ?? null,
      lastCallAt: latest?.createdAt ?? null,
      lastError: latest?.errorMessage ?? null,
    };
  };
  const state = () => ({
    usage: usage(),
    competitions: COMPETITIONS,
    bookmakers: BOOKMAKERS,
    fixtures: db
      .prepare(
        'SELECT * FROM odds_fixtures WHERE startDate>? ORDER BY startDate,externalId LIMIT 500',
      )
      .all(now())
      .map((row) => {
        const current = row.matchId
          ? db.prepare('SELECT * FROM matches WHERE id=?').get(row.matchId)
          : db
              .prepare(
                "SELECT * FROM matches WHERE sportKey='football' AND homeTeam=? COLLATE NOCASE AND awayTeam=? COLLATE NOCASE AND startDate=? LIMIT 1",
              )
              .get(row.homeTeam, row.awayTeam, row.startDate);
        return {
          ...row,
          quotes: JSON.parse(row.quotes),
          current: current
            ? {
                homeTeam: current.homeTeam,
                awayTeam: current.awayTeam,
                startDate: current.startDate,
                status: current.status,
                home: current.oddsHome,
                draw: current.oddsDraw,
                away: current.oddsAway,
                hasBets: Boolean(hasMatchBets(db, current.id)),
              }
            : null,
        };
      }),
  });

  async function request(competition, date, requestId, actorId, batchId = null) {
    ensure(
      ready(),
      409,
      'Import désactivé : configurer THE_ODDS_API_MODE=manual et THE_ODDS_API_KEY sur Render.',
    );
    ensure(has(COMPETITIONS, competition), 400, 'Compétition inconnue.');
    ensure(/^\d{4}-\d{2}-\d{2}$/.test(date), 400, 'Date invalide.');
    const from = Date.parse(`${date}T00:00:00Z`);
    const today = Date.parse(new Date(Date.now()).toISOString().slice(0, 10));
    ensure(
      Number.isFinite(from) &&
        new Date(from).toISOString().slice(0, 10) === date &&
        from >= today &&
        from <= today + 7 * DAY,
      400,
      'Choisir une date entre aujourd’hui et les sept prochains jours (UTC).',
    );
    const cacheKey = `${competition}/${date}`;
    const timestamp = Date.now();
    db.prepare('UPDATE odds_calls SET payload=NULL WHERE createdAt<? AND payload IS NOT NULL').run(
      timestamp - DAY,
    );
    const receipt = transaction(db, () => {
      ensure(
        !db
          .prepare("SELECT 1 FROM odds_batches WHERE state='PENDING' AND id!=? LIMIT 1")
          .get(batchId || ''),
        409,
        'Un chargement groupé est en cours ou interrompu. Relire les données locales.',
      );
      const previous = db.prepare('SELECT * FROM odds_calls WHERE id=?').get(requestId);
      if (previous) {
        ensure(previous.cacheKey === cacheKey, 409, 'Clé déjà utilisée pour une autre action.');
        ensure(
          ['SUCCESS', 'CACHED'].includes(previous.state),
          409,
          'Requête déjà tentée. Aucune relance automatique.',
        );
        const source = previous.sourceId
          ? db.prepare('SELECT * FROM odds_calls WHERE id=?').get(previous.sourceId)
          : previous;
        ensure(source?.payload, 409, 'Réponse expirée. Aucun appel renvoyé.');
        return { ...source, cached: true };
      }
      const hit = db
        .prepare(
          "SELECT * FROM odds_calls WHERE cacheKey=? AND state='SUCCESS' AND createdAt>? ORDER BY createdAt DESC LIMIT 1",
        )
        .get(cacheKey, timestamp - HOUR);
      if (hit) {
        db.prepare(
          "INSERT INTO odds_calls (id,cacheKey,state,createdAt,sourceId) VALUES (?,?,'CACHED',?,?)",
        ).run(requestId, cacheKey, timestamp, hit.id);
        return { ...hit, cached: true };
      }
      ensure(
        !db.prepare("SELECT 1 FROM odds_calls WHERE state='PENDING'").get(),
        409,
        'Un appel est en cours ou interrompu. Vérifier le journal avant de poursuivre.',
      );
      const current = usage();
      ensure(
        current.dailyUsed < current.dailyLimit && current.monthlyUsed < current.monthlyLimit,
        429,
        'Plafond local atteint (24 heures ou 31 jours glissants). Aucun appel envoyé.',
      );
      ensure(
        current.providerRemaining !== 0 || timestamp - current.providerCheckedAt > 31 * DAY,
        429,
        'Quota fournisseur épuisé au dernier appel. Import bloqué par précaution pendant 31 jours au maximum ; consulter son tableau de bord.',
      );
      ensure(
        batchId || !current.lastCallAt || timestamp - current.lastCallAt >= 60000,
        429,
        'Attendre une minute entre deux appels The Odds API.',
      );
      db.prepare(
        "INSERT INTO odds_calls (id,cacheKey,state,createdAt) VALUES (?,?,'PENDING',?)",
      ).run(requestId, cacheKey, timestamp);
      audit(db, actorId, 'ODDS_REQUEST_RESERVED', requestId, {
        competition,
        date,
        estimatedCredits: 1,
      });
      return null;
    });
    if (receipt) return receipt;
    let remaining = null;
    try {
      const url = new URL(`https://api.the-odds-api.com/v4/sports/${competition}/odds/`);
      url.search = new URLSearchParams({
        apiKey: config.oddsKey,
        regions: 'fr',
        markets: 'h2h',
        oddsFormat: 'decimal',
        dateFormat: 'iso',
        commenceTimeFrom: new Date(from).toISOString().replace('.000Z', 'Z'),
        commenceTimeTo: new Date(from + 7 * DAY - 1000).toISOString().replace('.000Z', 'Z'),
      }).toString();
      const response = await (config.oddsFetch || globalThis.fetch)(url.href, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      remaining = headerInteger(response, 'x-requests-remaining');
      ensure(
        response.ok,
        502,
        `The Odds API a refusé l’appel (HTTP ${response.status}). Vérifier la clé, le quota et la compétition dans son tableau de bord. Aucun nouvel essai automatique.`,
      );
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          ensure(bytes <= MAX_BYTES, 502, 'Réponse The Odds API trop volumineuse.');
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      ensure(
        Array.isArray(data) && data.length <= 1000,
        502,
        'Réponse The Odds API invalide. Aucun nouvel essai automatique.',
      );
      // Persist only the allowlisted fixture and price fields, never provider URLs or errors.
      const fixtures = [];
      for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        const start = Date.parse(item.commence_time);
        if (
          item.sport_key !== competition ||
          typeof item.id !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
          ![item.home_team, item.away_team].every(
            (v) => typeof v === 'string' && v.trim().length >= 2 && v.length <= 80,
          ) ||
          item.home_team.trim() === item.away_team.trim() ||
          !Number.isFinite(start) ||
          start <= timestamp ||
          start < from ||
          start >= from + 7 * DAY
        )
          continue;
        const quotes = [];
        for (const bookmaker of Array.isArray(item.bookmakers) ? item.bookmakers : []) {
          if (!bookmaker || !has(BOOKMAKERS, bookmaker.key) || !Array.isArray(bookmaker.markets))
            continue;
          const market = bookmaker.markets.find((m) => m?.key === 'h2h');
          const updatedAt = Date.parse(market?.last_update || bookmaker.last_update);
          if (
            !Number.isFinite(updatedAt) ||
            updatedAt < timestamp - HOUR ||
            updatedAt > timestamp + 60000 ||
            !Array.isArray(market?.outcomes)
          )
            continue;
          const price = (name) => {
            const values = market.outcomes.filter((v) => v?.name === name);
            const number = values.length === 1 ? values[0].price : null;
            return typeof number === 'number' &&
              Number.isFinite(number) &&
              number >= 1 &&
              number <= 1000 &&
              Math.abs(number * 100 - Math.round(number * 100)) < 0.000001
              ? Math.round(number * 100)
              : null;
          };
          const home = price(item.home_team),
            draw = price('Draw'),
            away = price(item.away_team);
          if (home && draw && away && !quotes.some((q) => q.bookmaker === bookmaker.key))
            quotes.push({ bookmaker: bookmaker.key, home, draw, away, updatedAt });
        }
        fixtures.push({
          externalId: item.id,
          sportKey: competition,
          competition: COMPETITIONS[competition],
          homeTeam: item.home_team.trim(),
          awayTeam: item.away_team.trim(),
          startDate: new Date(start).toISOString(),
          quotes,
        });
      }
      const payload = JSON.stringify(fixtures);
      db.prepare("UPDATE odds_calls SET state='SUCCESS',payload=?,remaining=? WHERE id=?").run(
        payload,
        remaining,
        requestId,
      );
      return { id: requestId, createdAt: timestamp, payload, cached: false };
    } catch (error) {
      // fetch errors can contain the URL with apiKey; never log, persist or expose their text.
      const safe =
        error instanceof AppError
          ? error
          : new AppError(
              502,
              'Appel The Odds API interrompu ou réponse invalide. Tentative comptée par précaution, sans relance.',
            );
      db.prepare("UPDATE odds_calls SET state='FAILED',remaining=?,errorMessage=? WHERE id=?").run(
        remaining,
        safe.message,
        requestId,
      );
      throw safe;
    }
  }

  async function preview(input, requestId, actorId, batchId = null) {
    ensure(input.consent === true, 400, 'Autoriser explicitement la consommation d’un crédit.');
    const receipt = await request(input.competition, input.date, requestId, actorId, batchId);
    transaction(db, () => {
      const newer = db
        .prepare(
          "SELECT 1 FROM odds_calls WHERE cacheKey LIKE ? AND state='SUCCESS' AND createdAt>? LIMIT 1",
        )
        .get(`${input.competition}/%`, receipt.createdAt);
      ensure(!newer, 409, 'Un aperçu plus récent existe. Relire les données locales.');
      // Hide drafts absent from the new snapshot, without deleting links to published matches.
      db.prepare('UPDATE odds_fixtures SET quotes=? WHERE sportKey=?').run('[]', input.competition);
      const upsert =
        db.prepare(`INSERT INTO odds_fixtures (externalId,sportKey,competition,homeTeam,awayTeam,startDate,quotes,fetchedAt,snapshotId)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(externalId) DO UPDATE SET sportKey=excluded.sportKey,competition=excluded.competition,
        homeTeam=excluded.homeTeam,awayTeam=excluded.awayTeam,startDate=excluded.startDate,quotes=excluded.quotes,fetchedAt=excluded.fetchedAt,snapshotId=excluded.snapshotId
        WHERE excluded.fetchedAt>=odds_fixtures.fetchedAt`);
      for (const row of JSON.parse(receipt.payload))
        upsert.run(
          row.externalId,
          row.sportKey,
          row.competition,
          row.homeTeam,
          row.awayTeam,
          row.startDate,
          JSON.stringify(row.quotes),
          receipt.createdAt,
          receipt.id,
        );
      audit(db, actorId, 'ODDS_PREVIEW_LOADED', receipt.id, { cached: receipt.cached });
    });
    return { ...state(), cached: receipt.cached };
  }

  function publishOne({ eventId, bookmaker, snapshotId }, actorId) {
    const fixture = db.prepare('SELECT * FROM odds_fixtures WHERE externalId=?').get(eventId);
    ensure(
      fixture && fixture.snapshotId === snapshotId,
      409,
      'Aperçu modifié ou introuvable. Relire la liste avant de publier.',
    );
    ensure(Date.parse(fixture.startDate) > Date.now(), 409, 'Ce match a déjà commencé.');
    const quote = JSON.parse(fixture.quotes).find((q) => q.bookmaker === bookmaker);
    ensure(
      quote && fixture.fetchedAt > Date.now() - HOUR && quote.updatedAt > Date.now() - HOUR,
      409,
      'Cotes 1N2 absentes ou expirées. Charger volontairement un nouvel aperçu.',
    );
    let current = fixture.matchId
      ? db.prepare('SELECT * FROM matches WHERE id=?').get(fixture.matchId)
      : null;
    if (!current) {
      const candidates = db
        .prepare(
          "SELECT * FROM matches WHERE sportKey='football' AND homeTeam=? COLLATE NOCASE AND awayTeam=? COLLATE NOCASE AND startDate=?",
        )
        .all(fixture.homeTeam, fixture.awayTeam, fixture.startDate);
      ensure(
        candidates.length <= 1,
        409,
        'Plusieurs matchs identiques existent. Résoudre le doublon dans l’administration.',
      );
      current = candidates[0];
    }
    if (current) {
      ensure(
        current.status === 'UPCOMING' && Date.parse(current.startDate) > Date.now(),
        409,
        'Ce match ne peut plus être modifié.',
      );
      ensure(
        !hasMatchBets(db, current.id) ||
          (current.homeTeam === fixture.homeTeam &&
            current.awayTeam === fixture.awayTeam &&
            current.startDate === fixture.startDate),
        409,
        'Des paris existent : équipes et date sont verrouillées. Traiter ce changement manuellement.',
      );
    }
    const id = current?.id || randomUUID();
    if (current)
      db.prepare(
        'UPDATE matches SET homeTeam=?,awayTeam=?,startDate=?,competition=?,oddsHome=?,oddsDraw=?,oddsAway=? WHERE id=?',
      ).run(
        fixture.homeTeam,
        fixture.awayTeam,
        fixture.startDate,
        fixture.competition,
        quote.home,
        quote.draw,
        quote.away,
        id,
      );
    else
      db.prepare(
        'INSERT INTO matches (id,homeTeam,awayTeam,startDate,competition,oddsHome,oddsDraw,oddsAway,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      ).run(
        id,
        fixture.homeTeam,
        fixture.awayTeam,
        fixture.startDate,
        fixture.competition,
        quote.home,
        quote.draw,
        quote.away,
        now(),
      );
    db.prepare('UPDATE odds_fixtures SET matchId=? WHERE externalId=?').run(id, eventId);
    audit(db, actorId, 'ODDS_MATCH_PUBLISHED', id, { eventId, bookmaker, snapshotId, quote });
    return id;
  }

  function publish(input, actorId) {
    const matchId = transaction(db, () => publishOne(input, actorId));
    return { ...state(), matchId };
  }

  function publishBatch({ fixtures }, actorId) {
    ensure(
      Array.isArray(fixtures) &&
        fixtures.length > 0 &&
        fixtures.length <= 200 &&
        new Set(fixtures.map((f) => f.eventId)).size === fixtures.length,
      400,
      'Choisir entre 1 et 200 rencontres distinctes.',
    );
    // Entire selection commits together; one expired/conflicting row rolls everything back.
    const matchIds = transaction(db, () => fixtures.map((input) => publishOne(input, actorId)));
    return { ...state(), publishedCount: matchIds.length };
  }

  async function previewBatch(input, batchId, actorId) {
    const { competitions, date, consent } = input;
    ensure(
      consent === true &&
        Array.isArray(competitions) &&
        competitions.length >= 1 &&
        competitions.length <= 5 &&
        new Set(competitions).size === competitions.length &&
        competitions.every((key) => has(COMPETITIONS, key)),
      400,
      'Choisir entre 1 et 5 compétitions distinctes et autoriser le coût maximal.',
    );
    const day = Date.parse(`${date}T00:00:00Z`);
    const today = Date.parse(new Date(Date.now()).toISOString().slice(0, 10));
    ensure(
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        Number.isFinite(day) &&
        new Date(day).toISOString().slice(0, 10) === date &&
        day >= today &&
        day <= today + 7 * DAY,
      400,
      'Date invalide : choisir aujourd’hui à J+7 (UTC).',
    );
    const serialized = JSON.stringify({ competitions: [...competitions].sort(), date });
    const replay = transaction(db, () => {
      const previous = db.prepare('SELECT * FROM odds_batches WHERE id=?').get(batchId);
      if (previous) {
        ensure(previous.input === serialized, 409, 'Clé déjà utilisée pour une autre sélection.');
        ensure(
          previous.state === 'COMPLETE',
          409,
          'Ce chargement a déjà été lancé. Relire les données locales, sans relance automatique.',
        );
        return JSON.parse(previous.results);
      }
      ensure(ready(), 409, 'Import désactivé : activer le mode manuel dans Render.');
      ensure(
        !db.prepare("SELECT 1 FROM odds_batches WHERE state='PENDING'").get() &&
          !db.prepare("SELECT 1 FROM odds_calls WHERE state='PENDING'").get(),
        409,
        'Un chargement est en cours ou interrompu.',
      );
      const required = competitions.filter(
        (key) =>
          !db
            .prepare(
              "SELECT 1 FROM odds_calls WHERE cacheKey=? AND state='SUCCESS' AND createdAt>? LIMIT 1",
            )
            .get(`${key}/${date}`, Date.now() - HOUR),
      ).length;
      const current = usage();
      ensure(
        current.dailyUsed + required <= current.dailyLimit &&
          current.monthlyUsed + required <= current.monthlyLimit,
        429,
        'Quota local insuffisant pour cette sélection. Réduire le nombre de championnats. Aucun appel envoyé.',
      );
      ensure(
        !required || !current.lastCallAt || Date.now() - current.lastCallAt >= 60000,
        429,
        'Attendre une minute entre deux chargements.',
      );
      ensure(
        !required ||
          current.providerRemaining === null ||
          Date.now() - current.providerCheckedAt > 31 * DAY ||
          current.providerRemaining >= required,
        429,
        'Crédits fournisseur insuffisants pour la sélection au dernier relevé. Aucun appel envoyé.',
      );
      db.prepare(
        "INSERT INTO odds_batches (id,input,createdAt,state) VALUES (?,?,?,'PENDING')",
      ).run(batchId, serialized, Date.now());
      audit(db, actorId, 'ODDS_BATCH_RESERVED', batchId, {
        competitions,
        date,
        maximumCredits: competitions.length,
        required,
      });
      return null;
    });
    if (replay)
      return {
        ...state(),
        batchResults: replay.map((row) => ({
          ...row,
          status: row.status === 'LOADED' ? 'CACHED' : row.status,
        })),
        replayed: true,
      };
    const results = [];
    let stopped = false;
    for (const competition of competitions) {
      if (stopped) {
        results.push({
          competition,
          status: 'SKIPPED',
          message: 'Non appelé : chargement arrêté après un échec.',
        });
        continue;
      }
      try {
        const result = await preview(
          { competition, date, consent: true },
          randomUUID(),
          actorId,
          batchId,
        );
        results.push({ competition, status: result.cached ? 'CACHED' : 'LOADED' });
      } catch (error) {
        results.push({
          competition,
          status: 'FAILED',
          message:
            error instanceof AppError
              ? error.message
              : 'Chargement interrompu. Aucune relance automatique.',
        });
        stopped = true;
      }
    }
    db.prepare("UPDATE odds_batches SET state='COMPLETE',results=? WHERE id=?").run(
      JSON.stringify(results),
      batchId,
    );
    return { ...state(), batchResults: results };
  }
  return { state, preview, publish, previewBatch, publishBatch };
}
