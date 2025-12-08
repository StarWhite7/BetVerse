export type UserRole = 'USER' | 'ADMIN' | 'SUPERADMIN';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  username?: string | null;
}
