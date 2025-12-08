import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, tap } from 'rxjs';
import { User } from '../../shared/models/user.model';
import { environment } from '../config/environment';

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  email: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiUrl;
  private readonly tokenKey = 'betverse_access_token';
  private readonly userKey = 'betverse_user';
  private readonly userSignal = signal<User | null>(null);
  private readonly tokenSignal = signal<string | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {
    this.restoreSession();
  }

  private get canUseStorage() {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private restoreSession() {
    if (!this.canUseStorage) {
      return;
    }

    try {
      const savedToken = localStorage.getItem(this.tokenKey);
      const savedUser = localStorage.getItem(this.userKey);

      if (savedToken && savedUser) {
        const parsed: User = JSON.parse(savedUser);
        this.tokenSignal.set(savedToken);
        this.userSignal.set(parsed);
      }
    } catch {
      this.clearSession();
    }
  }

  private persistSession(token: string, user: User) {
    this.tokenSignal.set(token);
    this.userSignal.set(user);
    if (this.canUseStorage) {
      localStorage.setItem(this.tokenKey, token);
      localStorage.setItem(this.userKey, JSON.stringify(user));
    }
  }

  private clearSession() {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    if (this.canUseStorage) {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
    }
  }

  currentUser() {
    return this.userSignal();
  }

  userChanges = computed(() => this.userSignal());

  token() {
    return this.tokenSignal();
  }

  isAuthenticated() {
    return !!this.tokenSignal();
  }

  login(payload: LoginPayload) {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, payload)
      .pipe(
        tap(({ access_token, user }) => {
          this.persistSession(access_token, user);
        }),
      );
  }

  register(payload: RegisterPayload) {
    return this.http.post<User>(`${this.apiUrl}/auth/register`, payload);
  }

  fetchProfile(): Observable<User | null> {
    if (!this.token()) {
      return of(null);
    }

    return this.http.get<User>(`${this.apiUrl}/auth/me`).pipe(
      tap((user) => {
        if (user) {
          this.userSignal.set(user);
          if (this.canUseStorage) {
            localStorage.setItem(this.userKey, JSON.stringify(user));
          }
        }
      }),
    );
  }

  logout(navigateToLogin = true) {
    this.clearSession();
    if (navigateToLogin) {
      this.router.navigate(['/auth/login']);
    }
  }
}
