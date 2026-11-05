CREATE TABLE odds_batches (
 id TEXT PRIMARY KEY, input TEXT NOT NULL, createdAt INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PENDING','COMPLETE')), results TEXT
);
