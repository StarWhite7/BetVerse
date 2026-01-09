import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  BetsApiService,
  BetEntity,
  ResolveBetResponse,
} from '../../../data-access/bets/bets.api';
import { NotificationService } from '../../../core/services/notification.service';

type BetsFilter = 'ALL' | 'PENDING' | 'WON' | 'LOST';
type SearchColumn = 'match' | 'id';

@Component({
  selector: 'admin-bets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bets.component.html',
  styleUrl: './bets.component.css',
})
export class BetsComponent implements OnInit {
  private readonly betsApi = inject(BetsApiService);
  private readonly notifications = inject(NotificationService);

  filters: { label: string; value: BetsFilter }[] = [
    { label: 'Tous', value: 'ALL' },
    { label: 'En attente', value: 'PENDING' },
    { label: 'Gagnes', value: 'WON' },
    { label: 'Perdus', value: 'LOST' },
  ];

  bets = signal<BetEntity[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filter = signal<BetsFilter>('PENDING');
  searchTerm = signal('');
  searchColumn = signal<SearchColumn>('match');
  filteredBets = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const column = this.searchColumn();
    if (!term) return this.bets();
    return this.bets().filter((bet) => {
      const field = bet[column];
      if (!field) return false;
      return field.toLowerCase().includes(term);
    });
  });
  resolveModalOpen = signal(false);
  resolveTarget = signal<BetEntity | null>(null);
  resolveResult = signal<'WON' | 'LOST'>('WON');
  resolveSubmitting = signal(false);

  ngOnInit() {
    this.loadBets();
  }

  loadBets() {
    this.loading.set(true);
    this.error.set(null);
    const status = this.filter();
    this.betsApi
      .getMyBets({
        status: status === 'ALL' ? undefined : (status as BetEntity['status']),
        order: 'desc',
        limit: 100,
      })
      .subscribe({
        next: (bets) => {
          this.bets.set(bets);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Impossible de charger les paris.');
          this.loading.set(false);
        },
      });
  }

  applyFilter(filter: BetsFilter) {
    if (this.filter() === filter) return;
    this.filter.set(filter);
    this.loadBets();
  }

  openResolveModal(bet: BetEntity, result: 'WON' | 'LOST' = 'WON') {
    this.resolveTarget.set(bet);
    this.resolveResult.set(result);
    this.resolveModalOpen.set(true);
  }

  closeResolveModal() {
    if (this.resolveSubmitting()) return;
    this.resolveModalOpen.set(false);
  }

  resolveBet() {
    const bet = this.resolveTarget();
    if (!bet) return;

    this.resolveSubmitting.set(true);
    this.betsApi
      .resolveBet({ betId: bet.id, result: this.resolveResult() })
      .subscribe({
        next: (response: ResolveBetResponse) => {
          this.resolveSubmitting.set(false);
          this.resolveModalOpen.set(false);
          this.notifications.success('Pari mis a jour.');
          this.updateBetInList(response.bet);
        },
        error: (err) => {
          this.resolveSubmitting.set(false);
          const message = err?.error?.message ?? 'Impossible de résoudre le pari.';
          this.notifications.error(message);
        },
      });
  }

  quickResolve(bet: BetEntity, result: 'WON' | 'LOST') {
    this.resolveTarget.set(bet);
    this.resolveResult.set(result);
    this.resolveBet();
  }

  updateResolveResult(event: Event) {
    const value = (event.target as HTMLSelectElement | null)?.value ?? 'WON';
    this.resolveResult.set(value as 'WON' | 'LOST');
  }

  trackByBet(_index: number, bet: BetEntity) {
    return bet.id;
  }

  private updateBetInList(updated: BetEntity) {
    this.bets.update((items) =>
      items.map((bet) => (bet.id === updated.id ? { ...bet, ...updated } : bet)),
    );
  }
}
