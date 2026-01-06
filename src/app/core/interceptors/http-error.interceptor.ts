import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (typeof ngDevMode !== 'undefined' && ngDevMode) {
        console.error('HTTP error', error);
      }
      return throwError(() => error);
    }),
  );
};
