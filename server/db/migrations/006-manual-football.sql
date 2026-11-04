-- No network access from migrations. Cache and request reservations survive deployments.
CREATE TABLE football_calls (
 id TEXT PRIMARY KEY,
 cacheKey TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PENDING','SUCCESS','FAILED','CACHED')),
 createdAt INTEGER NOT NULL,
 payload TEXT,
 sourceId TEXT REFERENCES football_calls(id),
 remaining INTEGER
);
CREATE INDEX football_calls_cache ON football_calls(cacheKey,createdAt);
CREATE INDEX football_calls_date ON football_calls(createdAt);
CREATE TABLE football_bookmakers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE football_fixtures (
 externalId INTEGER PRIMARY KEY,
 homeTeam TEXT NOT NULL,
 awayTeam TEXT NOT NULL,
 startDate TEXT NOT NULL,
 status TEXT NOT NULL,
 leagueId INTEGER NOT NULL,
 competition TEXT NOT NULL,
 fetchedAt TEXT NOT NULL,
 matchId TEXT UNIQUE REFERENCES matches(id)
);
