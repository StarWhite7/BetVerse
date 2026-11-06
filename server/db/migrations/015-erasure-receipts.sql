CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO app_metadata VALUES ('installation_id',lower(hex(randomblob(16))));
CREATE TABLE erasure_receipts (
  subjectHash TEXT PRIMARY KEY CHECK(length(subjectHash)=64),
  deletedAt TEXT NOT NULL
);
