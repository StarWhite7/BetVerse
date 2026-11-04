CREATE TABLE IF NOT EXISTS agency_mission_rewards (
 agencyId TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
 missionId TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(agencyId,missionId)
);
