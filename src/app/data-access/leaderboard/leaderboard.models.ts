export type LeaderboardMetric = 'VERSE' | 'WINS' | 'LEVEL';

export interface LeaderboardPlayer {
  id: string;
  username: string;
  clan?: string | null;
  initials: string;
  accent: string;
  level: number;
  xp: number;
  versePossessedTotal: number;
  verseWallet: number;
  versePending: number;
  verseInvested: number;
  verseEarned: number;
  betsWon: number;
  betsPlayed: number;
  winRate: number;
  currentStreak: number;
  city?: string | null;
}

export interface LeaderboardEntry extends LeaderboardPlayer {
  rank: number;
}

export interface LeaderboardMetricOption {
  id: LeaderboardMetric;
  label: string;
  description: string;
}
