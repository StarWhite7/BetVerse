import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BetsApiService, BetEntity } from '../../../data-access/bets/bets.api';
type BetsFilter = 'ALL' | 'PENDING' | 'WON' | 'LOST' | 'VOID';
@Component({
  selector: 'admin-bets',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './bets.component.html',
  styleUrl: './bets.component.css',
})
export class BetsComponent implements OnInit {
  private readonly api = inject(BetsApiService);
  filters: { label: string; value: BetsFilter }[] = [
    { label: 'Tous', value: 'ALL' },
    { label: 'En attente', value: 'PENDING' },
    { label: 'Gagnés', value: 'WON' },
    { label: 'Perdus', value: 'LOST' },
    { label: 'Remboursés', value: 'VOID' },
  ];
  bets = signal<BetEntity[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filter = signal<BetsFilter>('PENDING');
  searchTerm = signal('');
  searchColumn = signal<'match' | 'id'>('match');
  offset = signal(0);
  filteredBets = computed(() =>
    this.bets().filter((bet) =>
      bet[this.searchColumn()].toLowerCase().includes(this.searchTerm().trim().toLowerCase()),
    ),
  );
  ngOnInit() {
    this.loadBets();
  }
  loadBets() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.api
      .getAdminBets({
        status: this.filter() === 'ALL' ? undefined : (this.filter() as BetEntity['status']),
        limit: 100,
        skip: this.offset(),
        order: 'desc',
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
    this.filter.set(filter);
    this.offset.set(0);
    this.loadBets();
  }
  previous() {
    this.offset.update((n) => Math.max(0, n - 100));
    this.loadBets();
  }
  next() {
    this.offset.update((n) => n + 100);
    this.loadBets();
  }
  trackByBet(_index: number, bet: BetEntity) {
    return bet.id;
  }
}
