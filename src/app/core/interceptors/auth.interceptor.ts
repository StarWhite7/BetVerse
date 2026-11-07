import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { AdminAccessService } from '../services/admin-access.service';
import { environment } from '../config/environment';
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(`${environment.apiUrl}/`)) return next(req);
  const csrf = inject(AuthService).csrfToken();
  const proof = inject(AdminAccessService).getProof();
  return next(
    req.clone({
      withCredentials: true,
      setHeaders: {
        'X-Requested-With': 'BetVerse',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(proof && !environment.mobileOrigin && !req.url.startsWith(`${environment.apiUrl}/auth/`)
          ? { 'X-Admin-Tab': proof }
          : {}),
      },
    }),
  );
};
