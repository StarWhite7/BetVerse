import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { configureMobileApi, environment } from '../config/environment';
import { nativeHttpInterceptor } from './native-http.interceptor';

// CapacitorHttp is a Proxy on the web; provide the native bridge boundary here.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
  CapacitorHttp: { request: vi.fn() },
}));

describe('Android API transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([nativeHttpInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    environment.apiUrl = '/api';
    environment.mobileOrigin = null;
    vi.restoreAllMocks();
  });
  it('keeps browser requests on the browser transport', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const request = vi.spyOn(CapacitorHttp, 'request');
    TestBed.inject(HttpClient).get('/api/auth/me').subscribe();
    TestBed.inject(HttpTestingController).expectOne('/api/auth/me').flush({ id: 'user' });
    expect(request).not.toHaveBeenCalled();
  });
  it('preserves CSRF and JSON headers, adds the exact server origin and refuses redirects', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    configureMobileApi('https://beta.betverse.fr');
    const request = vi.spyOn(CapacitorHttp, 'request').mockResolvedValue({
      status: 200,
      data: { ok: true },
      headers: { 'X-CSRF-Token': 'next-token' },
      url: environment.apiUrl + '/bet/place',
    });
    const response = await firstValueFrom(
      TestBed.inject(HttpClient).post(
        environment.apiUrl + '/bet/place',
        { stake: 10 },
        {
          headers: { 'X-CSRF-Token': 'token', 'X-Requested-With': 'BetVerse' },
          observe: 'response',
        },
      ),
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        data: { stake: 10 },
        disableRedirects: true,
        headers: expect.objectContaining({
          Origin: 'https://beta.betverse.fr',
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'token',
          'X-Requested-With': 'BetVerse',
        }),
      }),
    );
    expect(response.headers.get('X-CSRF-Token')).toBe('next-token');
  });
  it('preserves server errors so authentication and validation handlers can react', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    configureMobileApi('https://beta.betverse.fr');
    vi.spyOn(CapacitorHttp, 'request').mockResolvedValue({
      status: 401,
      data: { message: 'Connexion requise.' },
      headers: {},
      url: environment.apiUrl + '/auth/me',
    });
    await expect(
      firstValueFrom(TestBed.inject(HttpClient).get(environment.apiUrl + '/auth/me')),
    ).rejects.toMatchObject({ status: 401, error: { message: 'Connexion requise.' } });
  });
  it('does not forward API headers to another host', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    configureMobileApi('https://beta.betverse.fr');
    const request = vi.spyOn(CapacitorHttp, 'request');
    TestBed.inject(HttpClient).get('https://other.example/api/auth/me').subscribe();
    TestBed.inject(HttpTestingController).expectOne('https://other.example/api/auth/me').flush({});
    expect(request).not.toHaveBeenCalled();
  });
  it('maps native network failures to Angular network errors', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    configureMobileApi('https://beta.betverse.fr');
    vi.spyOn(CapacitorHttp, 'request').mockRejectedValue(new Error('offline'));
    await expect(
      firstValueFrom(TestBed.inject(HttpClient).get(environment.apiUrl + '/auth/me')),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
  });
  it('rejects HTTP, credentials, paths and local origins before any mobile connection', () => {
    for (const origin of [
      'http://beta.betverse.fr',
      'https://beta.betverse.fr/api',
      'https://beta.betverse.fr/',
      'https://user:pass@beta.betverse.fr',
      'https://localhost',
    ]) {
      expect(() => configureMobileApi(origin)).toThrow();
    }
  });
});
