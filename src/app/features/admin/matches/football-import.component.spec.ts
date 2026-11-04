import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FootballImportComponent } from './football-import.component';

describe('Manual API Football import', () => {
  const state = {
    usage: {
      mode: 'manual',
      configured: true,
      used: 0,
      total: 10,
      remaining: 10,
      providerRemaining: null,
      lastCallAt: null,
    },
    fixtures: [],
    bookmakers: [],
  };
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads local state on opening and requires consent before each upstream action', () => {
    const fixture = TestBed.createComponent(FootballImportComponent);
    fixture.detectChanges();
    const read = http.expectOne('/api/admin/football');
    expect(read.request.method).toBe('GET');
    read.flush(state);
    const component = fixture.componentInstance;
    component.loadFixtures();
    http.expectNone((req) => req.method === 'POST');
    component.accepted = true;
    component.loadFixtures();
    component.loadFixtures();
    const action = http.expectOne('/api/admin/football/fixtures');
    expect(action.request.method).toBe('POST');
    expect(action.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(action.request.headers.has('x-apisports-key')).toBe(false);
    expect(component.accepted).toBe(false);
    action.flush({ ...state, cached: true });
    expect(component.message()).toContain('aucun quota consommé');
    component.loadFixtures();
    http.expectNone((req) => req.method === 'POST');
  });

  it('never retries a failed import and refreshes only the local request journal', () => {
    const fixture = TestBed.createComponent(FootballImportComponent);
    fixture.detectChanges();
    http.expectOne('/api/admin/football').flush(state);
    fixture.componentInstance.accepted = true;
    fixture.componentInstance.run('bookmakers', {});
    http
      .expectOne('/api/admin/football/bookmakers')
      .flush({ message: 'Quota atteint' }, { status: 429, statusText: 'Too Many Requests' });
    expect(fixture.componentInstance.message()).toBe('Quota atteint');
    const read = http.expectOne('/api/admin/football');
    expect(read.request.method).toBe('GET');
    read.flush(state);
    http.expectNone((req) => req.method === 'POST');
  });
});
