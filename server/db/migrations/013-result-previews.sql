CREATE TABLE result_previews (
  id TEXT PRIMARY KEY,
  actorId TEXT REFERENCES users(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL,
  rows TEXT NOT NULL,
  appliedAt TEXT
);
