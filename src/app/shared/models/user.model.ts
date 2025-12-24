export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  username?: string | null;
  xp?: number | null;
  level?: number | null;
  agencyId?: string | null;
}
