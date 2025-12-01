import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../../shared/models/user.model';

export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const user = auth.currentUser();

    if (!user) return false;

    return roles.includes(user.role);
  };
}
