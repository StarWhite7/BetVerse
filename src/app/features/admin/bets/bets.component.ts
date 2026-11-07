import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  AdminBet,
  BetCorrection,
  BetsApiService,
  BetEntity,
} from '../../../data-access/bets/bets.api';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
type BetsFilter = 'ALL' | BetEntity['status'];
@Component({
  selector: 'admin-bets',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DialogDirective],
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
  readonly statuses: Record<BetEntity['status'], string> = {
    PENDING: 'En cours',
    WON: 'Gagné',
    LOST: 'Perdu',
    VOID: 'Annulé et remboursé',
  };
  readonly corrections: BetCorrection[] = ['PENDING', 'WON', 'LOST', 'DRAW', 'VOID'];
  readonly pageSize = 100;
  bets = signal<AdminBet[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filter = signal<BetsFilter>('PENDING');
  searchTerm = signal('');
  usernameInput = '';
  username = signal('');
  total = signal(0);
  offset = signal(0);
  readonly target = signal<AdminBet | null>(null);
  readonly saving = signal(false);
  readonly correctionError = signal('');
  readonly result = signal('');
  readonly uncertain = signal(false);
  outcome: BetCorrection = 'PENDING';
  reason = '';
  private correctionKey = '';
  filteredBets = computed(() =>
    this.bets().filter((bet) =>
      `${bet.match} ${bet.id}`.toLowerCase().includes(this.searchTerm().trim().toLowerCase()),
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
        username: this.username() || undefined,
        limit: this.pageSize,
        skip: this.offset(),
        order: 'desc',
      })
      .subscribe({
        next: (response) => {
          const bets = response.body || [];
          const total = Number(response.headers.get('X-Total-Count') ?? bets.length);
          this.bets.set(bets);
          this.total.set(total);
          this.loading.set(false);
          if (this.offset() > 0 && this.offset() >= total) {
            this.offset.set(Math.floor(Math.max(0, total - 1) / this.pageSize) * this.pageSize);
            this.loadBets();
          }
        },
        error: (error) => {
          this.bets.set([]);
          this.total.set(0);
          this.error.set(error?.error?.message || 'Impossible de charger les paris.');
          this.loading.set(false);
        },
      });
  }
  searchPlayer() {
    if (this.loading()) return;
    this.username.set(this.usernameInput.trim());
    this.filter.set('ALL');
    this.searchTerm.set('');
    this.offset.set(0);
    this.loadBets();
  }
  applyFilter(filter: BetsFilter) {
    this.filter.set(filter);
    this.offset.set(0);
    this.loadBets();
  }
  previous() {
    this.offset.update((n) => Math.max(0, n - this.pageSize));
    this.loadBets();
  }
  next() {
    this.offset.update((n) => n + this.pageSize);
    this.loadBets();
  }
  openCorrection(bet: AdminBet) {
    this.outcome = bet.status;
    this.reason = '';
    this.correctionKey = crypto.randomUUID();
    this.correctionError.set('');
    this.uncertain.set(false);
    this.result.set('');
    this.target.set(bet);
  }
  closeCorrection() {
    if (!this.saving()) this.target.set(null);
  }
  correct() {
    const bet = this.target();
    if (!bet || this.saving() || this.outcome === bet.status || this.reason.trim().length < 10)
      return;
    this.saving.set(true);
    this.correctionError.set('');
    this.api.correctStatus(bet, this.outcome, this.reason.trim(), this.correctionKey).subscribe({
      next: () => {
        this.saving.set(false);
        this.target.set(null);
        this.result.set('Statut du pari mis à jour.');
        this.loadBets();
      },
      error: (error) => {
        this.saving.set(false);
        const uncertain = error.status === 0 || error.status >= 500;
        this.uncertain.set(uncertain);
        if (!uncertain) this.correctionKey = crypto.randomUUID();
        this.correctionError.set(
          uncertain
            ? 'Réponse indisponible. Tu peux renvoyer la même correction.'
            : error?.error?.message || 'Correction impossible.',
        );
      },
    });
  }
  trackByBet(_index: number, bet: BetEntity) {
    return bet.id;
  }
}
