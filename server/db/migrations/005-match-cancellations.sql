CREATE TABLE matches_v2 (
 id TEXT PRIMARY KEY, homeTeam TEXT NOT NULL, awayTeam TEXT NOT NULL, startDate TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK(status IN ('UPCOMING','LIVE','FINISHED','CANCELLED')),
 result TEXT CHECK(result IN ('HOME','AWAY','DRAW')), homeScore INTEGER, awayScore INTEGER,
 oddsHome INTEGER NOT NULL CHECK(oddsHome BETWEEN 100 AND 100000),
 oddsAway INTEGER NOT NULL CHECK(oddsAway BETWEEN 100 AND 100000),
 oddsDraw INTEGER CHECK(oddsDraw BETWEEN 100 AND 100000),
 sportTitle TEXT NOT NULL DEFAULT 'Football', sportKey TEXT NOT NULL DEFAULT 'football',
 competition TEXT NOT NULL DEFAULT 'Catalogue BetVerse', createdAt TEXT NOT NULL,
 cancellationReason TEXT
);
INSERT INTO matches_v2 (id,homeTeam,awayTeam,startDate,status,result,homeScore,awayScore,oddsHome,oddsAway,oddsDraw,sportTitle,sportKey,competition,createdAt)
 SELECT id,homeTeam,awayTeam,startDate,status,result,homeScore,awayScore,oddsHome,oddsAway,oddsDraw,sportTitle,sportKey,competition,createdAt FROM matches;
DROP TABLE matches;
ALTER TABLE matches_v2 RENAME TO matches;
CREATE INDEX matches_date ON matches(status,startDate);

CREATE TABLE bets_v2 (
 id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), matchId TEXT NOT NULL REFERENCES matches(id),
 match TEXT NOT NULL, betType TEXT NOT NULL CHECK(betType IN ('HOME','AWAY','DRAW')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 1000000), odds INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','WON','LOST','VOID')),
 payout INTEGER, createdAt TEXT NOT NULL, resolvedAt TEXT,
 requestKey TEXT NOT NULL, requestHash TEXT NOT NULL, UNIQUE(userId, requestKey)
);
INSERT INTO bets_v2 SELECT * FROM bets;
DROP TABLE bets;
ALTER TABLE bets_v2 RENAME TO bets;
CREATE INDEX bets_user ON bets(userId,createdAt DESC);
CREATE INDEX bets_match ON bets(matchId,status);
