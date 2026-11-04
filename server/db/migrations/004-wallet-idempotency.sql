CREATE TABLE wallet_commands (
 userId TEXT NOT NULL REFERENCES users(id), requestKey TEXT NOT NULL,
 requestHash TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(userId,requestKey)
);
