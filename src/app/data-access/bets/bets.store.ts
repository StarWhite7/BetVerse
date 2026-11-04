import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { BetsApiService, BetEntity, BetsQuery } from './bets.api';
import { AuthService } from '../../core/services/auth.service';
export type BetsFilter = 'ALL' | 'PENDING' | 'WON' | 'LOST' | 'VOID';

@Injectable({ providedIn: 'root' })
export class BetsStore {
  private readonly api = inject(BetsApiService);
  private readonly auth = inject(AuthService);
  private session = this.auth.sessionVersion();
  private pending?: Subscription;
  readonly pageSize = 25;
  bets = signal<BetEntity[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filter = signal<BetsFilter>('ALL');
  offset = signal(0);
  total = signal(0);
  page = computed(() => Math.floor(this.offset() / this.pageSize) + 1);
  canNext = computed(() => this.offset() + this.pageSize < this.total());
  constructor() {
    effect(() => {
      const version = this.auth.sessionVersion();
      if (version === this.session) return;
      this.session = version;
      this.pending?.unsubscribe();
      this.bets.set([]);
      this.total.set(0);
      this.offset.set(0);
      this.filter.set('ALL');
      this.loading.set(false);
      this.error.set(null);
    });
  }
  load(query: BetsQuery = {}) {
    this.pending?.unsubscribe();
    if (query.skip !== undefined) this.offset.set(query.skip);
    const status = this.filter() === 'ALL' ? undefined : (this.filter() as BetsQuery['status']);
    this.loading.set(true);
    this.error.set(null);
    this.pending = this.api
      .getMyBetsPage({ order: 'desc', limit: this.pageSize, skip: this.offset(), status })
      .subscribe({
        next: (response) => {
          this.bets.set(response.body ?? []);
          this.total.set(Number(response.headers.get('X-Total-Count') ?? 0));
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
    this.load({ skip: 0 });
  }
  nextPage() {
    if (this.canNext() && !this.loading()) this.load({ skip: this.offset() + this.pageSize });
  }
  previousPage() {
    if (this.offset() > 0 && !this.loading())
      this.load({ skip: Math.max(0, this.offset() - this.pageSize) });
  }
  refresh() {
    this.load();
  }
}
