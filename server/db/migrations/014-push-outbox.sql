CREATE TABLE push_devices (
  tokenHash TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sessionHash TEXT NOT NULL REFERENCES sessions(tokenHash) ON DELETE CASCADE,
  cipher TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE push_outbox (
  notificationId TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL REFERENCES push_devices(tokenHash) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENT','FAILED')),
  createdAt TEXT NOT NULL,
  PRIMARY KEY(notificationId,tokenHash)
);
