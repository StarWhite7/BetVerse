import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatchesApiService, MatchEntity } from '../../data-access/matches/matches.api';
import { BetsApiService } from '../../data-access/bets/bets.api';
import { NotificationService } from '../../core/services/notification.service';
import { BetsStore } from '../../data-access/bets/bets.store';
import { WalletApiService } from '../../data-access/wallet/wallet.api';

type SportFilter = {
  key: string;
  label: string;
  keywords: string[];
  fallback?: boolean;
};

const TEAM_LOGO_MAP: Record<string, string> = {
  arsenal: '/club/Premier_League/Arsenal_FC.png',
  astonvilla: '/club/Premier_League/Aston_Villa_FC.png',
  bournemouth: '/club/Premier_League/Bournemouth_AFC.png',
  brentford: '/club/Premier_League/Brentford_FC.png',
  brightonandhovealbion: '/club/Premier_League/Brighton.png',
  burnley: '/club/Premier_League/Burnley.png',
  chelsea: '/club/Premier_League/Chelsea.png',
  crystalpalace: '/club/Premier_League/Crystal_Palace_FC.png',
  everton: '/club/Premier_League/Everton_FC.png',
  fulham: '/club/Premier_League/Logo_Fulham.png',
  leedsunited: '/club/Premier_League/Leeds_United_FC.png',
  liverpool: '/club/Premier_League/liverpool-fc.png',
  manchestercity: '/club/Premier_League/Manchester_City_FC.png',
  manchesterunited: '/club/Premier_League/Manchester_United_FC.png',
  newcastleunited: '/club/Premier_League/Newcastle_United_FC.png',
  nottinghamforest: '/club/Premier_League/Nottingham_Forest.png',
  sunderland: '/club/Premier_League/Sunderland_AFC.png',
  tottenhamhotspur: '/club/Premier_League/Tottenham_Hotspur.png',
  westhamunited: '/club/Premier_League/West_Ham_United_FC.png',
  wolverhamptonwanderers: '/club/Premier_League/Wolverhampton_Wanderer.png',
  ajauxerre: '/club/Ligue_1/AJ_Auxerre.png',
  auxerre: '/club/Ligue_1/AJ_Auxerre.png',
  angers: '/club/Ligue_1/Angers_SCO.png',
  angerssco: '/club/Ligue_1/Angers_SCO.png',
  asmonaco: '/club/Ligue_1/AS_Monaco_FC.png',
  asmonacofc: '/club/Ligue_1/AS_Monaco_FC.png',
  monaco: '/club/Ligue_1/AS_Monaco_FC.png',
  fclorient: '/club/Ligue_1/FC_Lorient.png',
  lorient: '/club/Ligue_1/FC_Lorient.png',
  fcmetz: '/club/Ligue_1/FC_Metz.png',
  metz: '/club/Ligue_1/FC_Metz.png',
  fcnantes: '/club/Ligue_1/FC_Nantes.png',
  nantes: '/club/Ligue_1/FC_Nantes.png',
  havreac: '/club/Ligue_1/Havre_AC.png',
  lehavre: '/club/Ligue_1/Havre_AC.png',
  lehavreac: '/club/Ligue_1/Havre_AC.png',
  losclille: '/club/Ligue_1/LOSC_Lille.png',
  losc: '/club/Ligue_1/LOSC_Lille.png',
  lille: '/club/Ligue_1/LOSC_Lille.png',
  ogcnice: '/club/Ligue_1/OGC_Nice.png',
  nice: '/club/Ligue_1/OGC_Nice.png',
  olympiquedemarseille: '/club/Ligue_1/Olympique_de_Marseille.png',
  marseille: '/club/Ligue_1/Olympique_de_Marseille.png',
  om: '/club/Ligue_1/Olympique_de_Marseille.png',
  olympiquelyonnais: '/club/Ligue_1/Olympique_Lyonnais.png',
  lyon: '/club/Ligue_1/Olympique_Lyonnais.png',
  ol: '/club/Ligue_1/Olympique_Lyonnais.png',
  parisfc: '/club/Ligue_1/Paris_FC.png',
  parissaintgermain: '/club/Ligue_1/Paris_Saint-Germain.png',
  parissg: '/club/Ligue_1/Paris_Saint-Germain.png',
  parissaintgermains: '/club/Ligue_1/Paris_Saint-Germain.png',
  psg: '/club/Ligue_1/Paris_Saint-Germain.png',
  racingclubdestrasbourgalsace: '/club/Ligue_1/Racing_Club_de_Strasbourg_Alsace.png',
  rcstrasbourg: '/club/Ligue_1/Racing_Club_de_Strasbourg_Alsace.png',
  strasbourg: '/club/Ligue_1/Racing_Club_de_Strasbourg_Alsace.png',
  rclens: '/club/Ligue_1/RC_Lens.png',
  lens: '/club/Ligue_1/RC_Lens.png',
  stadebrestois: '/club/Ligue_1/Stade_Brestois.png',
  stadebrestois29: '/club/Ligue_1/Stade_Brestois.png',
  brest: '/club/Ligue_1/Stade_Brestois.png',
  staderennais: '/club/Ligue_1/Stade_Rennais_FC.png',
  staderennaisfc: '/club/Ligue_1/Stade_Rennais_FC.png',
  rennes: '/club/Ligue_1/Stade_Rennais_FC.png',
  toulousefc: '/club/Ligue_1/Toulouse_FC.png',
  toulouse: '/club/Ligue_1/Toulouse_FC.png',
};

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
  lastApiCallAt = signal<Date | null>(null);

  betModalOpen = signal(false);
  selectedMatch = signal<MatchEntity | null>(null);
  betAmount = signal(50);
  betType = signal<'HOME' | 'AWAY' | 'DRAW'>('HOME');
  betOdds = signal<number>(1.0);
  betError = signal<string | null>(null);
  betting = signal(false);
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
      return matchesBySport;
    }
    return matchesBySport.filter(
      (match) => this.resolveCompetitionLabel(match) === competition,
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
  }

  loadMatches() {
    this.loading.set(true);
    this.error.set(null);
    this.lastApiCallAt.set(new Date());
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

  noopRefresh() {
    // Le bouton ne fait rien pour le moment.
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

  teamLogoUrl(team: string): string {
    const normalized = this.normalizeTeamName(team);
    const matched = TEAM_LOGO_MAP[normalized];
    if (matched) {
      return matched;
    }
    const initials = this.teamInitials(team);
    const base = 'https://placehold.co/80x80/020617/ffffff?text=';
    return `${base}${encodeURIComponent(initials)}`;
  }

  private teamInitials(team: string): string {
    return team
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || team.charAt(0).toUpperCase();
  }

  private normalizeTeamName(team: string): string {
    return team
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
}
