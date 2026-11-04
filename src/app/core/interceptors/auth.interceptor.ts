import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../config/environment';
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(`${environment.apiUrl}/`)) return next(req);
  const csrf = inject(AuthService).csrfToken();
  return next(
    req.clone({
      withCredentials: true,
      setHeaders: { 'X-Requested-With': 'BetVerse', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    }),
  );
};
