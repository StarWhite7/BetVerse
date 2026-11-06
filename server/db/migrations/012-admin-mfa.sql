CREATE TABLE admin_mfa (
 userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 secretCipher TEXT, pendingCipher TEXT, pendingUntil INTEGER,
 lastStep INTEGER NOT NULL DEFAULT -1, recoveryHashes TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE session_mfa (
 tokenHash TEXT PRIMARY KEY REFERENCES sessions(tokenHash) ON DELETE CASCADE,
 expiresAt INTEGER NOT NULL
);
