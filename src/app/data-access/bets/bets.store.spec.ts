import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../core/services/auth.service';
import { BetsStore } from './bets.store';

describe('Bet history state', () => {
  let store: BetsStore;
  let http: HttpTestingController;
  const version = signal(0);
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { sessionVersion: version } },
      ],
    });
    store = TestBed.inject(BetsStore);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => http.verify());
  it('paginates using the server total', () => {
    store.load();
    http
      .expectOne((req) => req.params.get('skip') === '0')
      .flush([], { headers: { 'X-Total-Count': '30' } });
    expect(store.canNext()).toBe(true);
    store.nextPage();
    http
      .expectOne((req) => req.params.get('skip') === '25')
      .flush([], { headers: { 'X-Total-Count': '30' } });
    expect(store.page()).toBe(2);
    expect(store.canNext()).toBe(false);
  });
  it('cancels obsolete filters instead of overwriting a newer response', () => {
    store.setFilter('WON');
    const stale = http.expectOne((req) => req.params.get('status') === 'WON');
    store.setFilter('LOST');
    expect(stale.cancelled).toBe(true);
    http
      .expectOne((req) => req.params.get('status') === 'LOST')
      .flush([], { headers: { 'X-Total-Count': '0' } });
    expect(store.filter()).toBe('LOST');
  });
  it('clears account data and pending requests on a session change', () => {
    store.load();
    const request = http.expectOne((req) => req.url.includes('/my-bets'));
    version.update((n) => n + 1);
    TestBed.tick();
    expect(request.cancelled).toBe(true);
    expect(store.total()).toBe(0);
    expect(store.bets()).toEqual([]);
  });
});
