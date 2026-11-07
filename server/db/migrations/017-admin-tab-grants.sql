CREATE TABLE admin_tab_grants (
 tokenHash TEXT NOT NULL REFERENCES sessions(tokenHash) ON DELETE CASCADE,
 proofHash TEXT NOT NULL,
 PRIMARY KEY (tokenHash, proofHash)
) WITHOUT ROWID;

-- Previous grants covered every tab sharing the login cookie.
DELETE FROM session_mfa;
