import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatchesApiService, MatchEntity } from '../../data-access/matches/matches.api';

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
  selector: 'app-match-de-clan',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './matchdeclan.component.html',
  styleUrl: './matchdeclan.component.css',
})
export class MatchDeClanComponent implements OnInit {
  private readonly matchesApi = inject(MatchesApiService);

  matches = signal<MatchEntity[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  selectedWeekIndex = signal(0);
  selectedCompetitionKey = signal('all');

  matchesSorted = computed(() =>
    [...this.matches()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
  );
  weekOptions = computed(() => {
    const now = new Date();
    const startOfWeek = this.startOfWeekMonday(now);
    return Array.from({ length: 4 }, (_, index) => {
      const start = this.addDays(startOfWeek, index * 7);
      const end = this.endOfWeek(start);
      return {
        start,
        end,
        label: this.weekLabel(index),
        rangeLabel: this.rangeLabel(start, end),
      };
    });
  });
  matchesFiltered = computed(() => {
    const options = this.weekOptions();
    const selected = options[this.selectedWeekIndex()];
    const sorted = this.matchesSorted();
    if (!selected) {
      return sorted;
    }
    const startMs = selected.start.getTime();
    const endMs = selected.end.getTime();
    return sorted.filter((match) => {
      const matchTime = new Date(match.startDate).getTime();
      if (matchTime < startMs || matchTime > endMs) {
        return false;
      }
      const selectedCompetition = this.selectedCompetitionKey();
      if (selectedCompetition === 'all') {
        return true;
      }
      return this.matchCompetitionKey(match) === selectedCompetition;
    });
  });
  competitionOptions = computed(() => {
    const options = new Map<string, string>();
    this.matches().forEach((match) => {
      const label = this.matchCompetitionLabel(match);
      const key = this.normalizeCompetition(label);
      options.set(key, label);
    });
    const list = [...options.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return [{ key: 'all', label: 'Toutes competitions' }, ...list];
  });

  ngOnInit() {
    this.loadMatches();
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

  setWeek(indexValue: string) {
    const parsed = Number(indexValue);
    if (!Number.isNaN(parsed)) {
      this.selectedWeekIndex.set(parsed);
    }
  }

  setCompetition(key: string) {
    this.selectedCompetitionKey.set(key || 'all');
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

  private matchCompetitionLabel(match: MatchEntity): string {
    const raw =
      match.competition ||
      match.league ||
      match.sportTitle ||
      match.sport ||
      'Autre';
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'france') {
      return 'Ligue 1';
    }
    if (normalized === 'epl') {
      return 'Premier League';
    }
    return raw;
  }

  private matchCompetitionKey(match: MatchEntity): string {
    return this.normalizeCompetition(this.matchCompetitionLabel(match));
  }

  private normalizeCompetition(label: string): string {
    return label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private startOfWeekMonday(date: Date): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    return start;
  }

  private endOfWeek(start: Date): Date {
    const end = this.addDays(start, 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private addDays(base: Date, days: number): Date {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
  }

  private rangeLabel(start: Date, end: Date): string {
    const formatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
    return `Du ${formatter.format(start)} au ${formatter.format(end)}`;
  }

  private weekLabel(index: number): string {
    switch (index) {
      case 0:
        return 'Semaine actuelle';
      case 1:
        return 'Semaine suivante';
      case 2:
        return '2 semaines apres';
      case 3:
        return '3 semaines apres';
      default:
        return 'Semaine';
    }
  }
}
