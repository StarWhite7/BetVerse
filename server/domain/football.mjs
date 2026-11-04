import { randomUUID } from 'node:crypto';
import { AppError, ensure, transaction } from '../lib/errors.mjs';
import { audit, now } from './accounts.mjs';

const CACHE_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_BYTES = 4 * 1024 * 1024;

function providerError(errors) {
  // Classify in memory; never expose provider text, which may echo credentials.
  const details = JSON.stringify(errors ?? {}).toLowerCase();
  let reason = 'Réponse refusée par le fournisseur ; motif non reconnu.';
  if (/season/.test(details) && /plan|subscription|access|available/.test(details))
    reason = 'La saison demandée n’est pas accessible avec cet abonnement.';
  else if (/plan|subscription|permission|access to|not allowed/.test(details))
    reason = 'Le fournisseur refuse l’accès à cet endpoint avec cet abonnement.';
  else if (/quota|limit|too many|requests per/.test(details))
    reason = 'Le fournisseur signale une limite de requêtes atteinte.';
  else if (/token|api.?key|authentication/.test(details))
    reason = 'Le fournisseur refuse l’authentification de la clé API.';
  else if (/parameter|field|invalid|required/.test(details))
    reason = 'Le fournisseur refuse les paramètres de cette requête.';
  return `API Football : ${reason} Aucun nouvel essai automatique.`;
}

// Constructing this service never calls the provider. Only admin POST actions do.
export function manualFootball({ db, config }) {
  const fetchProvider = config.footballFetch || globalThis.fetch;
  const ready = () => config.footballMode === 'manual' && Boolean(config.footballKey);
  const usage = () => {
    const timestamp = Date.now();
    const latest = db
      .prepare(
        "SELECT * FROM football_calls WHERE state!='CACHED' ORDER BY createdAt DESC,rowid DESC LIMIT 1",
      )
      .get();
    const used = db
      .prepare("SELECT COUNT(*) count FROM football_calls WHERE state!='CACHED' AND createdAt>?")
      .get(timestamp - 86400000).count;
    return {
      mode: config.footballMode || 'disabled',
      configured: ready(),
      used,
      total: config.footballDailyLimit || 10,
      remaining: Math.max(0, (config.footballDailyLimit || 10) - used),
      providerRemaining: latest?.remaining ?? null,
      lastCallAt: latest ? new Date(latest.createdAt).toISOString() : null,
      nextSyncAt: null,
      lastError: latest?.errorMessage ?? null,
    };
  };

  async function request(path, params, requestId, actorId) {
    ensure(
      ready(),
      409,
      'Import désactivé. Configurer API_FOOTBALL_MODE=manual et API_FOOTBALL_KEY sur le serveur.',
    );
    const query = new URLSearchParams(params).toString();
    const cacheKey = query ? `${path}?${query}` : path;
    const timestamp = Date.now();
    // Keep request receipts, but bound storage even when the next action is refused.
    db.prepare(
      "UPDATE football_calls SET payload=NULL WHERE state='SUCCESS' AND createdAt<? AND payload IS NOT NULL",
    ).run(timestamp - 86400000);
    const cached = transaction(db, () => {
      const previous = db.prepare('SELECT * FROM football_calls WHERE id=?').get(requestId);
      if (previous) {
        ensure(
          previous.cacheKey === cacheKey,
          409,
          'Clé de requête déjà utilisée pour une autre action.',
        );
        ensure(
          ['SUCCESS', 'CACHED'].includes(previous.state),
          409,
          'Cette requête a déjà été tentée. Aucune relance automatique.',
        );
        const payload =
          previous.state === 'CACHED'
            ? db.prepare('SELECT payload FROM football_calls WHERE id=?').get(previous.sourceId)
                ?.payload
            : previous.payload;
        ensure(
          payload,
          409,
          'Cette requête a déjà été traitée et sa réponse a expiré. Aucun appel renvoyé.',
        );
        return payload;
      }
      const hit = db
        .prepare(
          "SELECT id,payload FROM football_calls WHERE cacheKey=? AND state='SUCCESS' AND createdAt>? ORDER BY createdAt DESC LIMIT 1",
        )
        .get(cacheKey, timestamp - CACHE_MS);
      if (hit) {
        db.prepare(
          "INSERT INTO football_calls (id,cacheKey,state,createdAt,sourceId) VALUES (?,?,'CACHED',?,?)",
        ).run(requestId, cacheKey, timestamp, hit.id);
        return hit.payload;
      }
      ensure(
        !db.prepare("SELECT 1 FROM football_calls WHERE state='PENDING'").get(),
        409,
        'Un appel est en cours ou a été interrompu. Vérifier le journal avant un nouvel appel.',
      );
      const current = usage();
      ensure(
        current.remaining > 0,
        429,
        'Plafond local atteint sur les dernières 24 heures. Aucun appel envoyé.',
      );
      ensure(
        !current.lastCallAt || timestamp - Date.parse(current.lastCallAt) >= COOLDOWN_MS,
        429,
        'Attendre une minute entre deux appels API Football.',
      );
      db.prepare(
        "INSERT INTO football_calls (id,cacheKey,state,createdAt) VALUES (?,?,'PENDING',?)",
      ).run(requestId, cacheKey, timestamp);
      audit(db, actorId, 'FOOTBALL_REQUEST_RESERVED', requestId, { path, params });
      return null;
    });
    if (cached !== null) return { data: JSON.parse(cached), cached: true };

    let remaining = null;
    try {
      const response = await fetchProvider(`https://v3.football.api-sports.io/${cacheKey}`, {
        headers: { 'x-apisports-key': config.footballKey, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const header = response.headers.get('x-ratelimit-requests-remaining');
      if (header !== null && /^\d+$/.test(header)) remaining = Number(header);
      ensure(
        response.ok,
        502,
        `API Football a refusé la requête (HTTP ${response.status}). Aucun nouvel essai automatique.`,
      );
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          ensure(bytes <= MAX_BYTES, 502, 'Réponse API Football trop volumineuse.');
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (data?.errors != null && Object.keys(data.errors).length > 0)
        throw new AppError(502, providerError(data.errors));
      // Provider error bodies may contain account details: never echo or log them.
      ensure(
        data &&
          data.errors != null &&
          Object.keys(data.errors).length === 0 &&
          Array.isArray(data.response),
        502,
        'API Football signale une erreur de quota, de paramètres ou d’abonnement. Consulter son tableau de bord. Aucun nouvel essai automatique.',
      );
      db.prepare("UPDATE football_calls SET state='SUCCESS',payload=?,remaining=? WHERE id=?").run(
        JSON.stringify(data),
        remaining,
        requestId,
      );
      return { data, cached: false };
    } catch (error) {
      const failure =
        error instanceof AppError
          ? error
          : new AppError(
              502,
              'Appel API Football interrompu ou réponse invalide. Il est compté par précaution ; aucune relance automatique.',
            );
      db.prepare(
        "UPDATE football_calls SET state='FAILED',remaining=?,errorMessage=? WHERE id=?",
      ).run(remaining, failure.message, requestId);
      throw failure;
    }
  }

  function fixtures() {
    return db
      .prepare('SELECT * FROM football_fixtures ORDER BY startDate,externalId LIMIT 500')
      .all();
  }

  const bookmakers = () => db.prepare('SELECT * FROM football_bookmakers ORDER BY name').all();
  async function loadBookmakers(requestId, actorId) {
    const { data, cached } = await request('odds/bookmakers', {}, requestId, actorId);
    transaction(db, () => {
      const upsert = db.prepare(
        'INSERT INTO football_bookmakers VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',
      );
      for (const row of data.response)
        if (
          Number.isSafeInteger(row.id) &&
          row.id > 0 &&
          typeof row.name === 'string' &&
          row.name.length <= 80
        )
          upsert.run(row.id, row.name);
      audit(db, actorId, 'FOOTBALL_BOOKMAKERS_LOADED', null, { cached });
    });
    return { cached, usage: usage(), bookmakers: bookmakers() };
  }

  async function loadFixtures(input, requestId, actorId) {
    const params = { date: input.date, timezone: 'UTC' };
    if (input.league) params.league = String(input.league);
    if (input.season) params.season = String(input.season);
    const { data, cached } = await request('fixtures', params, requestId, actorId);
    const rows = [];
    for (const item of data.response) {
      const externalId = item.fixture?.id,
        leagueId = item.league?.id;
      const homeTeam = item.teams?.home?.name,
        awayTeam = item.teams?.away?.name;
      const startDate = item.fixture?.date;
      const status = item.fixture?.status?.short;
      const competition = item.league?.name;
      if (
        !Number.isSafeInteger(externalId) ||
        externalId <= 0 ||
        !Number.isSafeInteger(leagueId) ||
        ![homeTeam, awayTeam].every(
          (name) => typeof name === 'string' && name.length >= 2 && name.length <= 80,
        ) ||
        homeTeam === awayTeam ||
        !Number.isFinite(Date.parse(startDate)) ||
        typeof status !== 'string' ||
        typeof competition !== 'string' ||
        competition.length < 1 ||
        competition.length > 80
      )
        continue;
      rows.push({
        externalId,
        homeTeam,
        awayTeam,
        startDate: new Date(startDate).toISOString(),
        status,
        leagueId,
        competition,
      });
    }
    transaction(db, () => {
      const upsert =
        db.prepare(`INSERT INTO football_fixtures (externalId,homeTeam,awayTeam,startDate,status,leagueId,competition,fetchedAt)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(externalId) DO UPDATE SET homeTeam=excluded.homeTeam,awayTeam=excluded.awayTeam,
        startDate=excluded.startDate,status=excluded.status,leagueId=excluded.leagueId,competition=excluded.competition,fetchedAt=excluded.fetchedAt`);
      for (const row of rows)
        upsert.run(
          row.externalId,
          row.homeTeam,
          row.awayTeam,
          row.startDate,
          row.status,
          row.leagueId,
          row.competition,
          now(),
        );
      audit(db, actorId, 'FOOTBALL_FIXTURES_LOADED', null, { count: rows.length, cached });
    });
    return { count: rows.length, cached, usage: usage(), fixtures: fixtures() };
  }

  function importableFixture(fixtureId) {
    const fixture = db.prepare('SELECT * FROM football_fixtures WHERE externalId=?').get(fixtureId);
    ensure(
      fixture && fixture.status === 'NS' && Date.parse(fixture.startDate) > Date.now(),
      409,
      'Choisir une rencontre future non commencée dans le calendrier chargé.',
    );
    const current = fixture.matchId
      ? db.prepare('SELECT * FROM matches WHERE id=?').get(fixture.matchId)
      : null;
    if (current) {
      ensure(
        current.status === 'UPCOMING' && Date.parse(current.startDate) > Date.now(),
        409,
        'Ce match ne peut plus être modifié.',
      );
      const hasBets = db.prepare('SELECT 1 FROM bets WHERE matchId=? LIMIT 1').get(current.id);
      ensure(
        !hasBets ||
          (current.homeTeam === fixture.homeTeam &&
            current.awayTeam === fixture.awayTeam &&
            current.startDate === fixture.startDate),
        409,
        'Des paris existent : équipes et date sont verrouillées. Traiter le changement de calendrier manuellement.',
      );
    }
    return { fixture, current };
  }

  async function importOdds(input, requestId, actorId) {
    // Reject known local conflicts before spending any provider quota.
    importableFixture(input.fixtureId);
    // One fixture, one bookmaker, one market, one page. Never follow paging.next.
    const { data, cached } = await request(
      'odds',
      {
        fixture: String(input.fixtureId),
        bookmaker: String(input.bookmakerId),
        bet: '1',
        page: '1',
      },
      requestId,
      actorId,
    );
    const values = data.response
      .find((row) => row.fixture?.id === input.fixtureId)
      ?.bookmakers?.find((bookmaker) => bookmaker.id === input.bookmakerId)
      ?.bets?.find((bet) => bet.id === 1)?.values;
    const quote = (label) => {
      const value = values?.find((entry) => entry.value === label)?.odd;
      const decimal =
        typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value) ? Number(value) : NaN;
      ensure(
        Number.isFinite(decimal) && decimal >= 1 && decimal <= 1000,
        409,
        'Cotes 1X2 complètes indisponibles pour ce bookmaker. Aucun match publié et aucun appel supplémentaire.',
      );
      return Math.round(decimal * 100);
    };
    const oddsHome = quote('Home'),
      oddsDraw = quote('Draw'),
      oddsAway = quote('Away');
    const matchId = transaction(db, () => {
      const { fixture, current } = importableFixture(input.fixtureId);
      const matchId = current?.id || randomUUID();
      if (current) {
        db.prepare(
          'UPDATE matches SET homeTeam=?,awayTeam=?,startDate=?,competition=?,oddsHome=?,oddsAway=?,oddsDraw=? WHERE id=?',
        ).run(
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.startDate,
          fixture.competition,
          oddsHome,
          oddsAway,
          oddsDraw,
          matchId,
        );
      } else {
        db.prepare(
          'INSERT INTO matches (id,homeTeam,awayTeam,startDate,competition,oddsHome,oddsAway,oddsDraw,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        ).run(
          matchId,
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.startDate,
          fixture.competition,
          oddsHome,
          oddsAway,
          oddsDraw,
          now(),
        );
        db.prepare('UPDATE football_fixtures SET matchId=? WHERE externalId=?').run(
          matchId,
          input.fixtureId,
        );
      }
      audit(db, actorId, 'FOOTBALL_ODDS_IMPORTED', matchId, {
        fixtureId: input.fixtureId,
        bookmakerId: input.bookmakerId,
        cached,
      });
      return matchId;
    });
    return { matchId, cached, usage: usage(), fixtures: fixtures() };
  }
  return { usage, fixtures, bookmakers, loadBookmakers, loadFixtures, importOdds };
}
