import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../config/environment';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notices = inject(NotificationService);
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (
        error.status === 401 &&
        req.url.startsWith(`${environment.apiUrl}/`) &&
        !req.url.includes('/auth/')
      )
        auth.expireSession();
      if (
        req.url.startsWith(`${environment.apiUrl}/`) &&
        !req.url.includes('/auth/') &&
        (error.status === 0 || error.status >= 500)
      )
        notices.error('Le serveur est indisponible. Réessayez dans quelques instants.');
      if (typeof ngDevMode !== 'undefined' && ngDevMode) {
        console.error('HTTP error', error);
      }
      return throwError(() => error);
    }),
  );
};
