import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatchesApiService, MatchEntity } from '../../data-access/matches/matches.api';
import { BetsApiService } from '../../data-access/bets/bets.api';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { BetsStore } from '../../data-access/bets/bets.store';
import { WalletApiService } from '../../data-access/wallet/wallet.api';
import { TEAM_LOGO_MAP } from '../../shared/team-logos';
import { officialTeamName } from '../../shared/team-names';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogDirective } from '../../shared/directives/dialog.directive';
import { teamLogoUrl as localTeamLogo } from '../../shared/utils/team-presentation';
import { clubBadgeUrl } from '../../shared/utils/club-badges';

type SportFilter = {
  key: string;
  label: string;
  keywords: string[];
  fallback?: boolean;
};

const competitionBanners = new Map([
  ['ligue 1', { asset: 'ligue_1', background: '#12327e' }],
  ['premier league', { asset: 'premier_league', background: '#3c164b' }],
  ['laliga', { asset: 'la_liga', background: '#792919' }],
  ['serie a', { asset: 'serie_a', background: '#f4e5c4', foreground: '#142137' }],
  ['bundesliga', { asset: 'bundesliga', background: '#591719' }],
]);

@Component({
  selector: 'app-matches',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogDirective],
  templateUrl: './matches.html',
  styleUrl: './matches.css',
})
export class MatchesComponent implements OnInit {
  private readonly matchesApi = inject(MatchesApiService);
  private readonly betsApi = inject(BetsApiService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly betsStore = inject(BetsStore);
  private readonly walletApi = inject(WalletApiService);
  private readonly destroyRef = inject(DestroyRef);

  matches = signal<MatchEntity[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  lastApiCallAt = signal<Date | null>(null);
  currentTime = signal(Date.now());

  betModalOpen = signal(false);
  selectedMatch = signal<MatchEntity | null>(null);
  betAmount = signal(50);
  betType = signal<'HOME' | 'AWAY' | 'DRAW'>('HOME');
  betOdds = signal<number>(1.0);
  betError = signal<string | null>(null);
  betting = signal(false);
  private betRequestKey = crypto.randomUUID();
  walletBalance = signal<number | null>(null);
  walletLoading = signal(false);
  readonly sportFilters: SportFilter[] = [
    { key: 'FOOTBALL', label: 'Football', keywords: ['football', 'soccer'], fallback: true },
    { key: 'TENNIS', label: 'Tennis', keywords: ['tennis'] },
    { key: 'BASKETBALL', label: 'Basketball', keywords: ['basketball'] },
  ];
  private readonly competitionLabelMap: Record<string, string> = {
    EPL: 'Premier League',
    France: 'Ligue 1',
    Spain: 'LaLiga',
    Italy: 'Serie A',
    Germany: 'Bundesliga',
  };
  private readonly fallbackSportKey =
    this.sportFilters.find((filter) => filter.fallback)?.key ?? this.sportFilters[0].key;
  readonly competitionAllKey = 'ALL_COMPETITIONS';
  selectedSport = signal<string>(this.fallbackSportKey);
  selectedCompetition = signal<string>(this.competitionAllKey);
  matchesBySelectedSport = computed(() => {
    const selected = this.selectedSport();
    return this.matches().filter((match) => this.resolveSportKey(match) === selected);
  });
  availableCompetitions = computed(() => {
    const unique = new Set<string>();
    for (const match of this.matchesBySelectedSport()) {
      const label = this.resolveCompetitionLabel(match);
      if (label) {
        unique.add(label);
      }
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  });
  filteredMatches = computed(() => {
    const matchesBySport = this.matchesBySelectedSport();
    const competition = this.selectedCompetition();
    if (competition === this.competitionAllKey) {
      return matchesBySport.filter((match) => this.isMatchUpcoming(match));
    }
    return matchesBySport.filter(
      (match) => this.resolveCompetitionLabel(match) === competition && this.isMatchUpcoming(match),
    );
  });
  activeSportLabel = computed(() => {
    const current = this.selectedSport();
    return this.sportFilters.find((filter) => filter.key === current)?.label ?? 'ce sport';
  });
  activeCompetitionLabel = computed(() => {
    const current = this.selectedCompetition();
    if (current === this.competitionAllKey) {
      return 'toutes les compétitions';
    }
    return current;
  });
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
    this.walletApi
      .walletChanges()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((wallet) => {
        this.walletBalance.set(wallet?.balance ?? null);
      });
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.currentTime.set(Date.now());
        if (!this.betModalOpen() && !this.loading()) this.loadMatches(true);
      });
  }

  loadMatches(background = false) {
    if (!background) this.loading.set(true);
    this.error.set(null);
    this.lastApiCallAt.set(new Date());
    this.matchesApi
      .getMatches('UPCOMING')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
    this.walletApi
      .getWallet()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
    this.betRequestKey = crypto.randomUUID();
    this.selectedMatch.set(match);
    this.betType.set(type);
    this.betOdds.set(
      type === 'HOME' ? match.oddsHome : type === 'AWAY' ? match.oddsAway : (match.oddsDraw ?? 1.0),
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
    if (this.betAmount() !== value) this.betRequestKey = crypto.randomUUID();
    this.betAmount.set(value);
  }

  selectSport(sport: string) {
    if (this.sportFilters.some((filter) => filter.key === sport)) {
      this.selectedSport.set(sport);
      this.selectedCompetition.set(this.competitionAllKey);
    }
  }
  selectCompetition(competition: string) {
    if (competition === this.competitionAllKey) {
      this.selectedCompetition.set(competition);
      return;
    }
    if (this.availableCompetitions().includes(competition)) {
      this.selectedCompetition.set(competition);
    }
  }

  submitBet() {
    if (this.betting()) return;
    const match = this.selectedMatch();
    const amount = this.betAmount();
    if (!match || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) {
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
        requestKey: this.betRequestKey,
      })
      .subscribe({
        next: () => {
          this.betting.set(false);
          this.betModalOpen.set(false);
          this.notifications.success('Pari cree avec succes.');
          this.betsStore.refresh();
          this.loadWalletBalance();
          this.auth.fetchProfile().subscribe();
        },
        error: (err) => {
          const message = err?.error?.message ?? 'Impossible de créer le pari.';
          this.betError.set(message);
          this.notifications.error(message);
          this.betting.set(false);
        },
      });
  }

  noopRefresh() {
    this.loadMatches();
  }

  private resolveSportKey(match: MatchEntity): string {
    const rawValues = [
      match.sportTitle,
      match.sport,
      match.sportKey,
      match.league,
      match.competition,
    ]
      .map((entry) => (typeof entry === 'string' ? entry.toLowerCase() : ''))
      .filter((entry) => entry.length);

    for (const filter of this.sportFilters) {
      const matchesFilter = rawValues.some((value) =>
        filter.keywords.some((keyword) => value.includes(keyword.toLowerCase())),
      );
      if (matchesFilter) {
        return filter.key;
      }
    }

    return this.fallbackSportKey;
  }

  private resolveCompetitionLabel(match: MatchEntity): string | null {
    const candidates = [match.competition, match.league];
    for (const entry of candidates) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed.length) {
          return this.competitionLabelMap[trimmed] ?? trimmed;
        }
      }
    }
    return null;
  }

  competitionBanner(match: MatchEntity) {
    if (this.resolveSportKey(match) !== 'FOOTBALL') return null;
    const label = this.resolveCompetitionLabel(match);
    if (!label) return null;
    const key = label.toLowerCase().replace(/^la\s+liga$/, 'laliga');
    const banner = competitionBanners.get(key);
    return banner ? { ...banner, label } : null;
  }

  teamLogoUrl(team: string): string {
    return localTeamLogo(team);
  }

  teamBadgeUrl(match: MatchEntity, team: string): string | undefined {
    return this.resolveSportKey(match) === 'FOOTBALL' ? clubBadgeUrl(team) : undefined;
  }

  private teamInitials(team: string): string {
    return (
      team
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('') || team.charAt(0).toUpperCase()
    );
  }

  private normalizeTeamName(team: string): string {
    return team
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  displayTeamName(team: string): string {
    return officialTeamName(team, (value) => this.normalizeTeamName(value));
  }

  private isMatchUpcoming(match: MatchEntity): boolean {
    const matchTime = new Date(match.startDate).getTime();
    if (!Number.isFinite(matchTime)) {
      return true;
    }
    return matchTime > this.currentTime();
  }
}
