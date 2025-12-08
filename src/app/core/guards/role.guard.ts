import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../../shared/models/user.model';

export function roleGuard(roles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.currentUser();

    if (!user) {
      return router.createUrlTree(['/auth/login']);
    }

    return roles.includes(user.role)
      ? true
      : router.createUrlTree(['/']);
  };
}
