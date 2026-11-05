import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OddsImportComponent } from './odds-import.component';

describe('Manual The Odds API import', () => {
  const fixture = {
    externalId: 'event-1',
    sportKey: 'soccer_france_ligue_one',
    homeTeam: 'Home FC',
    awayTeam: 'Away FC',
    competition: 'Ligue 1',
    startDate: new Date(Date.now() + 86400000).toISOString(),
    fetchedAt: Date.now(),
    snapshotId: 'snapshot',
    matchId: null,
    quotes: [{ bookmaker: 'winamax_fr', home: 180, draw: 310, away: 240, updatedAt: Date.now() }],
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
    bookmakers: { winamax_fr: 'Winamax France' },
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
    expect(view.componentInstance.selectedCompetitions()).toEqual([]);
    expect(view.componentInstance.majorLeagues.length).toBe(5);
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
    component.toggleCompetition('soccer_france_ligue_one', true);
    component.toggleCompetition('soccer_epl', true);
    component.accepted = true;
    component.preview();
    component.preview();
    const request = http.expectOne('/api/admin/odds/preview-batch');
    expect(request.request.body.competitions).toEqual(['soccer_france_ligue_one', 'soccer_epl']);
    expect(request.request.body.consent).toBe(true);
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(JSON.stringify(request.request.body)).not.toContain('apiKey');
    expect(component.accepted).toBe(false);
    request.flush({
      ...state,
      batchResults: [
        { competition: 'soccer_france_ligue_one', status: 'CACHED' },
        { competition: 'soccer_epl', status: 'CACHED' },
      ],
    });
    expect(component.message()).toContain('0 appel');
    expect(component.selectedFixtures().length).toBe(1);
    component.preview();
    http.expectNone((request) => request.method === 'POST');
  });
  it('publishes the displayed snapshot with no preview request and never retries failures', () => {
    const view = TestBed.createComponent(OddsImportComponent);
    view.detectChanges();
    http.expectOne('/api/admin/odds').flush(state);
    const component = view.componentInstance;
    component.toggleAll(true);
    component.publishSelected();
    component.publishSelected();
    const publish = http.expectOne('/api/admin/odds/publish-batch');
    expect(publish.request.body.fixtures[0].snapshotId).toBe('snapshot');
    expect(publish.request.body.fixtures[0].bookmaker).toBe('winamax_fr');
    publish.flush({ message: 'Aperçu expiré' }, { status: 409, statusText: 'Conflict' });
    expect(component.message()).toBe('Aperçu expiré');
    http.expectOne('/api/admin/odds').flush(state);
    http.expectNone((request) => request.method === 'POST');
  });

  it('renders one row per fixture, detects changes and excludes unchanged or unavailable prices', () => {
    const view = TestBed.createComponent(OddsImportComponent);
    view.detectChanges();
    const unchanged = {
      ...fixture,
      externalId: 'unchanged',
      current: {
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        startDate: fixture.startDate,
        status: 'UPCOMING',
        home: 180,
        draw: 310,
        away: 240,
        hasBets: false,
      },
    };
    const changed = {
      ...unchanged,
      externalId: 'changed',
      quotes: [{ ...fixture.quotes[0], home: 210 }],
    };
    http
      .expectOne('/api/admin/odds')
      .flush({
        ...state,
        fixtures: [fixture, unchanged, changed, { ...fixture, externalId: 'missing', quotes: [] }],
      });
    view.detectChanges();
    const component = view.componentInstance;
    expect(view.nativeElement.querySelectorAll('tbody tr').length).toBe(4);
    expect(view.nativeElement.textContent).toContain('Cotes modifiées');
    expect(view.nativeElement.querySelector('del').textContent).toContain('1.80');
    component.toggleAll(true);
    expect(component.selectedFixtures().map((row) => row.externalId)).toEqual([
      'event-1',
      'changed',
    ]);
    component.toggleRow('changed', false);
    expect(component.selectedFixtures().length).toBe(1);
    component.accepted = true;
    component.toggleCompetition('soccer_epl', true);
    expect(component.accepted).toBe(false);
    expect(component.selectedRows()).toEqual([]);
    http.expectNone((request) => request.method === 'POST');
  });
});
