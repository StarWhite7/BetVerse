import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { WalletApiService, WalletEntity } from '../../data-access/wallet/wallet.api';
import { BetsApiService, BetEntity } from '../../data-access/bets/bets.api';
import { MatchesApiService, MatchEntity } from '../../data-access/matches/matches.api';
import { AuthService } from '../../core/services/auth.service';

interface StatCard {
  label: string;
  value: string;
  trend: string;
}

interface MatchPreview {
  title: string;
  subtitle: string;
  start: string;
  oddsHome: number;
  oddsAway: number;
  oddsDraw?: number | null;
}

interface ActionCard {
  title: string;
  description: string;
  cta: string;
  link: string;
  accent: 'primary' | 'secondary' | 'ghost';
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly walletApi = inject(WalletApiService);
  private readonly betsApi = inject(BetsApiService);
  private readonly matchesApi = inject(MatchesApiService);
  private readonly auth = inject(AuthService);
  private readonly verseFormatter = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  });

  wallet = signal<WalletEntity | null>(null);
  bets = signal<BetEntity[]>([]);
  matches = signal<MatchEntity[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  user = computed(() => this.auth.currentUser());
  hasAdminAccess = computed(() => this.user()?.role === 'ADMIN');
  hasWalletAccess = computed(() => this.user()?.role === 'ADMIN');

  stats = computed<StatCard[]>(() => {
    const wallet = this.wallet();
    const bets = this.bets();
    const pendingAmount = bets
      .filter((bet) => bet.status === 'PENDING')
      .reduce((sum, bet) => sum + bet.amount, 0);
    const wonAmount = bets
      .filter((bet) => bet.status === 'WON')
      .reduce((sum, bet) => sum + bet.amount * bet.odds, 0);

    return [
      {
        label: 'Solde wallet',
        value: wallet ? this.formatVerse(wallet.balance) : '0 V',
        trend: pendingAmount ? `${pendingAmount} V engagés` : 'Aucun pari en attente',
      },
      {
        label: 'Paris gagnés',
        value: `${bets.filter((b) => b.status === 'WON').length}`,
        trend: `${bets.length} paris au total`,
      },
      {
        label: 'Gain potentiel',
        value: wonAmount ? this.formatVerse(wonAmount) : '0 V',
        trend: 'Basé sur les gains cumulés',
      },
      {
        label: 'Matchs dispo',
        value: `${this.matches().length}`,
        trend: `${this.matches().filter((match) => match.status === 'UPCOMING').length} à venir`,
      },
    ];
  });

  pendingBets = computed(() =>
    this.bets()
      .filter((bet) => bet.status === 'PENDING')
      .slice(0, 4),
  );
  recentBets = computed(() => this.bets().slice(0, 4));
  featuredMatches = computed<MatchPreview[]>(() =>
    this.matches()
      .slice(0, 3)
      .map((match) => ({
        title: `${match.homeTeam} vs ${match.awayTeam}`,
        subtitle: match.status,
        start: new Date(match.startDate).toLocaleString('fr-FR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
        oddsHome: match.oddsHome,
        oddsAway: match.oddsAway,
        oddsDraw: match.oddsDraw,
      })),
  );
  quickActions = computed<ActionCard[]>(() => {
    const actions: ActionCard[] = [];

    if (this.hasWalletAccess()) {
      actions.push({
        title: 'Crediter ton wallet',
        description: 'Ajoute des fonds avant ton prochain ticket.',
        cta: 'Deposer',
        link: '/wallet',
        accent: 'primary',
      });
    }

    actions.push({
      title: 'Parier sur un match',
      description: 'Consulte les cotes en direct.',
      cta: 'Voir les matchs',
      link: '/matches',
      accent: 'secondary',
    });

    if (this.hasWalletAccess()) {
      actions.push({
        title: 'Mon historique',
        description: 'Transactions et paris passes.',
        cta: 'Consulter',
        link: '/wallet/history',
        accent: 'ghost',
      });
    }

    if (this.hasAdminAccess()) {
      actions.push({
        title: 'Panel administrateur',
        description: 'Resoudre matchs et paris.',
        cta: "Ouvrir l'admin",
        link: '/admin',
        accent: 'primary',
      });
    }

    return actions;
  });

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      wallet: this.walletApi.getWallet(),
      bets: this.betsApi.getMyBets({ limit: 5 }),
      matches: this.matchesApi.getMatches('UPCOMING'),
    }).subscribe({
      next: ({ wallet, bets, matches }) => {
        this.wallet.set(wallet);
        this.bets.set(bets);
        this.matches.set(matches);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les données du dashboard.');
        this.loading.set(false);
      },
    });
  }

  private formatVerse(amount: number): string {
    return `${this.verseFormatter.format(amount)} V`;
  }

  formatCurrency(amount: number) {
    return this.formatVerse(amount);
  }
}
