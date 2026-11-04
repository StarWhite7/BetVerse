import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { defer, from, map, catchError, throwError } from 'rxjs';
import { environment } from '../config/environment';

// Only our API uses the native cookie jar. Web requests keep the browser transport.
export const nativeHttpInterceptor: HttpInterceptorFn = (req, next) => {
  if (!Capacitor.isNativePlatform() || !req.url.startsWith(`${environment.apiUrl}/`)) {
    return next(req);
  }
  if (!environment.mobileOrigin) {
    return throwError(
      () => new HttpErrorResponse({ status: 0, error: 'Serveur mobile non configuré.' }),
    );
  }
  const headers: Record<string, string> = {};
  for (const key of req.headers.keys()) headers[key] = req.headers.get(key)!;
  // Native HTTP does not supply a browser Origin. Keep the server's existing
  // exact-origin + JSON + CSRF checks; no wildcard CORS or cookie access in JS.
  headers['Origin'] = environment.mobileOrigin;
  headers['Accept'] = 'application/json';
  if (req.body !== null) headers['Content-Type'] = 'application/json';
  return defer(() =>
    from(
      CapacitorHttp.request({
        url: req.urlWithParams,
        method: req.method,
        headers,
        ...(req.body !== null ? { data: req.body } : {}),
        responseType: 'json',
        connectTimeout: 10_000,
        readTimeout: 15_000,
        disableRedirects: true,
      }),
    ),
  ).pipe(
    map((response) => {
      const options = {
        body: response.data,
        headers: new HttpHeaders(response.headers),
        status: response.status,
        url: response.url || req.urlWithParams,
      };
      if (response.status < 200 || response.status >= 300) {
        throw new HttpErrorResponse({ ...options, error: response.data });
      }
      return new HttpResponse(options);
    }),
    catchError((error: unknown) =>
      throwError(() =>
        error instanceof HttpErrorResponse
          ? error
          : new HttpErrorResponse({ status: 0, url: req.urlWithParams, error }),
      ),
    ),
  );
};
