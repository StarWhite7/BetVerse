import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatchesApiService, MatchEntity } from '../../data-access/matches/matches.api';
import { BetsApiService } from '../../data-access/bets/bets.api';
import { NotificationService } from '../../core/services/notification.service';
import { BetsStore } from '../../data-access/bets/bets.store';
import { WalletApiService } from '../../data-access/wallet/wallet.api';

@Component({
  selector: 'app-matches',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './matches.html',
  styleUrl: './matches.css',
})
export class MatchesComponent implements OnInit {
  private readonly matchesApi = inject(MatchesApiService);
  private readonly betsApi = inject(BetsApiService);
  private readonly notifications = inject(NotificationService);
  private readonly betsStore = inject(BetsStore);
  private readonly walletApi = inject(WalletApiService);

  matches = signal<MatchEntity[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  betModalOpen = signal(false);
  selectedMatch = signal<MatchEntity | null>(null);
  betAmount = signal(50);
  betType = signal<'HOME' | 'AWAY' | 'DRAW'>('HOME');
  betOdds = signal<number>(1.0);
  betError = signal<string | null>(null);
  betting = signal(false);
  walletBalance = signal<number | null>(null);
  walletLoading = signal(false);
  selectionLabel = computed(() => {
    const match = this.selectedMatch();
    const currentType = this.betType();
    if (!match) return '';
    if (currentType === 'HOME') return `Victoire ${match.homeTeam}`;
    if (currentType === 'AWAY') return `Victoire ${match.awayTeam}`;
    return 'Match nul';
  });
  potentialPayout = computed(() => {
    const amount = this.betAmount();
    const odds = this.betOdds();
    return amount > 0 ? amount * odds : 0;
  });

  ngOnInit() {
    this.loadMatches();
    this.loadWalletBalance();
  }

  loadMatches() {
    this.loading.set(true);
    this.error.set(null);
    this.matchesApi.getMatches('UPCOMING').subscribe({
      next: (matches) => {
        this.matches.set(matches);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les matchs.');
        this.loading.set(false);
      },
    });
  }

  private loadWalletBalance() {
    this.walletLoading.set(true);
    this.walletApi.getWallet().subscribe({
      next: (wallet) => {
        this.walletBalance.set(wallet.balance);
        this.walletLoading.set(false);
      },
      error: () => {
        this.walletBalance.set(null);
        this.walletLoading.set(false);
      },
    });
  }

  openBetModal(match: MatchEntity, type: 'HOME' | 'AWAY' | 'DRAW') {
    this.selectedMatch.set(match);
    this.betType.set(type);
    this.betOdds.set(
      type === 'HOME' ? match.oddsHome : type === 'AWAY' ? match.oddsAway : match.oddsDraw ?? 1.0,
    );
    this.betAmount.set(50);
    this.betError.set(null);
    this.betModalOpen.set(true);
  }

  closeBetModal() {
    if (this.betting()) return;
    this.betModalOpen.set(false);
  }

  get betAmountValue() {
    return this.betAmount();
  }

  set betAmountValue(value: number) {
    this.betAmount.set(value);
  }

  submitBet() {
    const match = this.selectedMatch();
    const amount = this.betAmount();
    if (!match || amount <= 0) {
      this.betError.set('Montant invalide');
      return;
    }
    const balance = this.walletBalance();
    if (balance !== null && amount > balance) {
      this.betError.set('Solde insuffisant pour ce pari.');
      return;
    }

    this.betting.set(true);
    this.betError.set(null);
    this.betsApi
      .createBet({
        matchId: match.id,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        betType: this.betType(),
        amount,
        odds: this.betOdds(),
      })
      .subscribe({
        next: () => {
          this.betting.set(false);
          this.betModalOpen.set(false);
          this.notifications.success('Pari cree avec succes.');
          this.betsStore.refresh();
          this.loadWalletBalance();
        },
        error: (err) => {
          const message = err?.error?.message ?? 'Impossible de creer le pari.';
          this.betError.set(message);
          this.notifications.error(message);
          this.betting.set(false);
        },
      });
  }
}
