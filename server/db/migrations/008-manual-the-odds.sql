-- Local-only migration. Provider quota and cache survive builds and restarts.
CREATE TABLE odds_calls (
 id TEXT PRIMARY KEY, cacheKey TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PENDING','SUCCESS','FAILED','CACHED')),
 createdAt INTEGER NOT NULL, payload TEXT, sourceId TEXT REFERENCES odds_calls(id),
 remaining INTEGER, errorMessage TEXT
);
CREATE INDEX odds_calls_cache ON odds_calls(cacheKey,createdAt);
CREATE INDEX odds_calls_date ON odds_calls(createdAt);
CREATE TABLE odds_fixtures (
 externalId TEXT PRIMARY KEY, sportKey TEXT NOT NULL, competition TEXT NOT NULL,
 homeTeam TEXT NOT NULL, awayTeam TEXT NOT NULL, startDate TEXT NOT NULL,
 quotes TEXT NOT NULL, fetchedAt INTEGER NOT NULL, snapshotId TEXT NOT NULL,
 matchId TEXT UNIQUE REFERENCES matches(id)
);
