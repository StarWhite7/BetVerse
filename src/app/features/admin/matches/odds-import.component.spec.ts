import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OddsImportComponent } from './odds-import.component';

describe('Manual The Odds API import', () => {
  const fixture = {
    externalId: 'event-1',
    homeTeam: 'Home FC',
    awayTeam: 'Away FC',
    competition: 'Ligue 1',
    startDate: new Date(Date.now() + 86400000).toISOString(),
    fetchedAt: Date.now(),
    snapshotId: 'snapshot',
    matchId: null,
    quotes: [{ bookmaker: 'betclic_fr', home: 180, draw: 310, away: 240, updatedAt: Date.now() }],
  };
  const state = {
    usage: {
      configured: true,
      mode: 'manual',
      dailyUsed: 0,
      dailyLimit: 10,
      monthlyUsed: 0,
      monthlyLimit: 400,
      providerRemaining: null,
      lastCallAt: null,
      providerCheckedAt: null,
      lastError: null,
    },
    competitions: { soccer_france_ligue_one: 'Ligue 1' },
    bookmakers: { betclic_fr: 'Betclic France' },
    fixtures: [fixture],
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
  it('reads only local data on startup and allows a local reread without consent', () => {
    const view = TestBed.createComponent(OddsImportComponent);
    view.detectChanges();
    const read = http.expectOne('/api/admin/odds');
    expect(read.request.method).toBe('GET');
    read.flush(state);
    view.componentInstance.read();
    http.expectOne('/api/admin/odds').flush(state);
    http.expectNone((request) => request.method === 'POST');
  });
  it('loads one preview only after consent and does not send provider credentials', () => {
    const view = TestBed.createComponent(OddsImportComponent);
    view.detectChanges();
    http.expectOne('/api/admin/odds').flush(state);
    const component = view.componentInstance;
    component.preview();
    http.expectNone((request) => request.method === 'POST');
    component.accepted = true;
    component.preview();
    component.preview();
    const request = http.expectOne('/api/admin/odds/preview');
    expect(request.request.body.consent).toBe(true);
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(JSON.stringify(request.request.body)).not.toContain('apiKey');
    expect(component.accepted).toBe(false);
    request.flush({ ...state, cached: true });
    expect(component.message()).toContain('aucun crédit consommé');
    component.preview();
    http.expectNone((request) => request.method === 'POST');
  });
  it('publishes the displayed snapshot with no preview request and never retries failures', () => {
    const view = TestBed.createComponent(OddsImportComponent);
    view.detectChanges();
    http.expectOne('/api/admin/odds').flush(state);
    const component = view.componentInstance;
    component.publish(fixture);
    component.publish(fixture);
    const publish = http.expectOne('/api/admin/odds/publish');
    expect(publish.request.body.snapshotId).toBe('snapshot');
    expect(publish.request.body.bookmaker).toBe('betclic_fr');
    publish.flush({ message: 'Aperçu expiré' }, { status: 409, statusText: 'Conflict' });
    expect(component.message()).toBe('Aperçu expiré');
    http.expectOne('/api/admin/odds').flush(state);
    http.expectNone((request) => request.method === 'POST');
  });
});
