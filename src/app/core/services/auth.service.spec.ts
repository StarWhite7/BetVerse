import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from '../interceptors/auth.interceptor';

describe('Cookie authentication', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const user = { id: 'user-a', email: 'a@example.test', username: 'alice', role: 'USER' as const };
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => http.verify());
  it('boots to the login page on an anonymous response', () => {
    let result: unknown = 'pending';
    auth.initialize().subscribe((value) => (result = value));
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(result).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });
  it('keeps the application usable when the API is unavailable', () => {
    auth.initialize().subscribe();
    http.expectOne('/api/auth/me').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(auth.startupError()).toContain('indisponible');
  });
  it('keeps the token out of localStorage and authenticates API requests with CSRF', () => {
    auth.login({ identifier: 'alice', password: 'TestPassword123' }).subscribe();
    const login = http.expectOne('/api/auth/login');
    expect(login.request.withCredentials).toBe(true);
    login.flush({ user, csrfToken: 'csrf-value' });
    expect(auth.currentUser()?.id).toBe(user.id);
    expect(window.localStorage?.getItem('betverse_access_token') ?? null).toBeNull();
    auth.logout(false);
    const logout = http.expectOne('/api/auth/logout');
    expect(logout.request.headers.get('X-CSRF-Token')).toBe('csrf-value');
    logout.flush({ success: true });
    expect(auth.isAuthenticated()).toBe(false);
  });
  it('does not report logout success when server revocation fails', () => {
    auth.login({ identifier: 'alice', password: 'TestPassword123' }).subscribe();
    http.expectOne('/api/auth/login').flush({ user, csrfToken: 'token' });
    auth.logout(false);
    http.expectOne('/api/auth/logout').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.startupError()).toContain('déconnexion');
  });
  it('restores the CSRF secret from a refreshed server session', () => {
    auth.fetchProfile().subscribe();
    http.expectOne('/api/auth/me').flush(user, { headers: { 'X-CSRF-Token': 'restored' } });
    expect(auth.csrfToken()).toBe('restored');
  });
});
