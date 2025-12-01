export type UserRole = 'user' | 'admin' | 'superadmin';

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}