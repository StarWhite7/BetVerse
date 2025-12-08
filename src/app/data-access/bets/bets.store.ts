import { Injectable, signal } from '@angular/core';
import { BetsApiService, BetEntity, BetsQuery } from './bets.api';

export type BetsFilter = 'ALL' | 'PENDING' | 'WON' | 'LOST';

@Injectable({ providedIn: 'root' })
export class BetsStore {
  private readonly betsApi: BetsApiService;
  private readonly defaultQuery: BetsQuery = { order: 'desc', limit: 25 };
  private currentQuery: BetsQuery = { ...this.defaultQuery };

  bets = signal<BetEntity[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filter = signal<BetsFilter>('ALL');

  constructor(betsApi: BetsApiService) {
    this.betsApi = betsApi;
  }

  load(query: BetsQuery = {}) {
    this.loading.set(true);
    this.error.set(null);
    this.currentQuery = { ...this.defaultQuery, ...query };

    this.betsApi.getMyBets(this.currentQuery).subscribe({
      next: (bets) => {
        this.bets.set(bets);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger vos paris.');
        this.loading.set(false);
      },
    });
  }

  setFilter(filter: BetsFilter) {
    this.filter.set(filter);
    const status = filter === 'ALL' ? undefined : (filter as BetsQuery['status']);
    this.load({ ...this.currentQuery, status });
  }

  refresh() {
    this.load({ ...this.currentQuery });
  }
}
