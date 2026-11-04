import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, of, timeout, map } from 'rxjs';
import { User } from '../../shared/models/user.model';
import { environment } from '../config/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<User | null>(null);
  private readonly csrfSignal = signal<string | null>(null);
  readonly startupError = signal<string | null>(null);
  readonly userChanges = computed(() => this.userSignal());
  readonly sessionVersion = signal(0);
  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {
    try {
      window.localStorage?.removeItem('betverse_access_token');
      window.localStorage?.removeItem('betverse_user');
    } catch {
      /* Storage may be disabled; server sessions still work. */
    }
  }
  currentUser() {
    return this.userSignal();
  }
  csrfToken() {
    return this.csrfSignal();
  }
  isAuthenticated() {
    return this.userSignal() !== null;
  }
  private clearSession() {
    this.userSignal.set(null);
    this.csrfSignal.set(null);
    this.sessionVersion.update((value) => value + 1);
  }
  login(payload: { identifier: string; password: string }) {
    return this.http
      .post<{ user: User; csrfToken: string }>(`${environment.apiUrl}/auth/login`, payload)
      .pipe(
        tap((response) => {
          this.clearSession();
          this.csrfSignal.set(response.csrfToken);
          this.userSignal.set(response.user);
          this.startupError.set(null);
        }),
      );
  }
  register(payload: { email: string; password: string; username: string }) {
    return this.http.post<User & { requiresVerification?: boolean }>(
      `${environment.apiUrl}/auth/register`,
      payload,
    );
  }
  resendVerification(identifier: string) {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/resend-verification`, {
      identifier,
    });
  }
  verifyEmail(token: string) {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/verify-email`, {
      token,
    });
  }
  requestPasswordReset(payload: { identifier: string }) {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/auth/forgot-password`,
      payload,
    );
  }
  resetPassword(payload: { token: string; password: string }) {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/auth/reset-password`,
      payload,
    );
  }
  fetchProfile(): Observable<User | null> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`, { observe: 'response' }).pipe(
      timeout(10_000),
      tap((response) => {
        this.csrfSignal.set(response.headers.get('X-CSRF-Token'));
        this.userSignal.set(response.body);
        this.startupError.set(null);
      }),
      map((response) => response.body),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.clearSession();
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }
  initialize(): Observable<User | null> {
    return this.fetchProfile().pipe(
      catchError(() => {
        this.clearSession();
        this.startupError.set(
          'Le serveur est momentanément indisponible. Réessayez dans quelques instants.',
        );
        return of(null);
      }),
    );
  }
  syncUser(user: User) {
    this.userSignal.set(user);
  }
  expireSession() {
    if (!this.isAuthenticated()) return;
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }
  logout(navigateToLogin = true) {
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({
      next: () => {
        this.clearSession();
        if (navigateToLogin) this.router.navigate(['/auth/login']);
      },
      error: () =>
        this.startupError.set(
          'La déconnexion a échoué. Réessayez lorsque le serveur est disponible.',
        ),
    });
  }
}
