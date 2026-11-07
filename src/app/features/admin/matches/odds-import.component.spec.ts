import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
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
        provideRouter([]),
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
  it('explains MFA rejection and links to admin security without a provider request', () => {
    const view = TestBed.createComponent(OddsImportComponent);
    view.detectChanges();
    const message =
      'Validez votre session avec votre code de double authentification dans l’onglet Sécurité.';
    http
      .expectOne('/api/admin/odds')
      .flush({ code: 'ADMIN_MFA_REQUIRED', message }, { status: 403, statusText: 'Forbidden' });
    view.detectChanges();
    expect(view.nativeElement.querySelector('[role="status"]').textContent).toContain(message);
    expect(view.nativeElement.querySelector('a').getAttribute('href')).toBe('/admin/security');
    http.expectNone((request) => request.method === 'POST');
  });

  for (const [mode, label, cost] of [
    ['odds', 'Actualiser les matchs et cotes', 2],
    ['scores', 'Actualiser les résultats', 2],
    ['global', 'Actualisation globale', 4],
  ] as const) {
    it(`sends a single ${mode} sync and displays the result without a confirmation step`, () => {
      const view = TestBed.createComponent(OddsImportComponent);
      view.detectChanges();
      const cup = 'soccer_uefa_champs_league';
      const mixed = {
        ...state,
        competitions: { ...state.competitions, [cup]: 'Ligue des champions' },
      };
      http.expectOne('/api/admin/odds').flush(mixed);
      const component = view.componentInstance;
      const button = () =>
        Array.from(
          view.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
        ).find((entry) => entry.textContent?.includes(label))!;
      view.detectChanges();
      expect(button().disabled).toBe(true);
      component.toggleCompetition(fixture.sportKey, true);
      component.toggleCompetition(cup, true);
      view.detectChanges();
      expect(button().disabled).toBe(false);
      expect(button().textContent).toContain(`≤ ${cost}`);
      button().click();
      component.sync(mode);
      const request = http.expectOne('/api/admin/odds/sync');
      expect(request.request.body).toMatchObject({
        mode,
        competitions: [fixture.sportKey, cup],
        consent: true,
        bookmaker: 'winamax_fr',
      });
      expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
      request.flush({
        ...mixed,
        batchResults: [
          {
            competition: fixture.sportKey,
            kind: mode === 'scores' ? 'scores' : 'odds',
            status: 'LOADED',
            applied: 1,
          },
        ],
      });
      expect(component.message()).toContain(
        mode === 'scores' ? '1 résultat(s) réglé(s)' : '1 match(s) publié(s)',
      );
      view.detectChanges();
      expect(view.nativeElement.textContent).not.toContain('Valider la sélection');
      expect(view.nativeElement.textContent).not.toContain('Valider les résultats');
      http.expectNone((request) => request.method === 'POST');
    });
  }
});
