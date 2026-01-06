import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatchesApiService, MatchEntity } from '../../data-access/matches/matches.api';
import { AgenceApiService, AgencyMatchScore, AgencyMatchVoteSummary } from '../../data-access/agence/agence.api';
import { TEAM_LOGO_MAP } from '../../shared/team-logos';
import { officialTeamName } from '../../shared/team-names';

@Component({
  selector: 'app-match-de-clan',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './matchdeclan.component.html',
  styleUrl: './matchdeclan.component.css',
})
export class MatchDeClanComponent implements OnInit {
  private readonly matchesApi = inject(MatchesApiService);
  private readonly agenceApi = inject(AgenceApiService);

  matches = signal<MatchEntity[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  selectedWeekIndex = signal(1);
  selectedCompetitionKey = signal('all');
  saving = signal(false);
  saveMessage = signal('');
  private saveTimeout?: number;
  userScores = signal<Record<string, AgencyMatchScore>>({});
  agencyScores = signal<Record<string, AgencyMatchScore>>({});
  totalVotes = signal<Record<string, number>>({});

  matchesSorted = computed(() =>
    [...this.matches()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
  );
  weekOptions = computed(() => {
    const now = new Date();
    const startOfWeek = this.startOfWeekMonday(now);
    const offsets = [-1, 0, 1, 2, 3];
    return offsets.map((offset) => {
      const start = this.addDays(startOfWeek, offset * 7);
      const end = this.endOfWeek(start);
      return {
        start,
        end,
        label: this.weekLabel(offset),
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
    this.setDefaultWeek();
    this.loadMatches();
  }

  loadMatches() {
    this.loading.set(true);
    this.error.set(null);
    this.matchesApi.getMatches().subscribe({
      next: (matches) => {
        this.matches.set(matches);
        this.loadVotes(matches.map((match) => match.id));
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

  get selectedWeekIndexValue(): number {
    return this.selectedWeekIndex();
  }

  set selectedWeekIndexValue(value: number) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      this.selectedWeekIndex.set(parsed);
    }
  }

  setCompetition(key: string) {
    this.selectedCompetitionKey.set(key || 'all');
  }

  saveScores() {
    if (this.saving()) {
      return;
    }
    const matches = this.matchesFiltered().filter((match) => this.isMatchEditable(match));
    if (!matches.length) {
      return;
    }
    const scores = this.userScores();
    const votes = matches.map((match) => {
      const score = scores[match.id] ?? { homeScore: 0, awayScore: 0 };
      return {
        matchId: match.id,
        homeScore: score.homeScore,
        awayScore: score.awayScore,
      };
    });
    this.saving.set(true);
    this.saveMessage.set('Sauvegarde en cours...');
    this.clearSaveTimeout();
    this.agenceApi.saveMatchVotes(votes).subscribe({
      next: (summary) => {
        this.applyVotes(summary);
        this.saving.set(false);
        this.saveMessage.set('Sauvegarde effectuee.');
        this.saveTimeout = window.setTimeout(() => {
          this.saveMessage.set('');
          this.saveTimeout = undefined;
        }, 2000);
      },
      error: () => {
        this.saving.set(false);
        this.saveMessage.set("Echec de la sauvegarde.");
        this.saveTimeout = window.setTimeout(() => {
          this.saveMessage.set('');
          this.saveTimeout = undefined;
        }, 2000);
      },
    });
  }

  loadVotes(matchIds: string[]) {
    if (!matchIds.length) {
      return;
    }
    this.agenceApi.getMatchVotes({ matchIds }).subscribe({
      next: (summary) => {
        this.applyVotes(summary);
      },
    });
  }

  applyVotes(summary: AgencyMatchVoteSummary[]) {
    const nextUserScores = { ...this.userScores() };
    const nextAgencyScores = { ...this.agencyScores() };
    const nextTotalVotes = { ...this.totalVotes() };

    summary.forEach((entry) => {
      if (entry.userScore) {
        nextUserScores[entry.matchId] = entry.userScore;
      } else if (!nextUserScores[entry.matchId]) {
        nextUserScores[entry.matchId] = { homeScore: 0, awayScore: 0 };
      }
      if (entry.agencyScore) {
        nextAgencyScores[entry.matchId] = entry.agencyScore;
      } else {
        delete nextAgencyScores[entry.matchId];
      }
      nextTotalVotes[entry.matchId] = entry.totalVotes;
    });

    this.userScores.set(nextUserScores);
    this.agencyScores.set(nextAgencyScores);
    this.totalVotes.set(nextTotalVotes);
  }

  getUserScore(matchId: string): AgencyMatchScore {
    return this.userScores()[matchId] ?? { homeScore: 0, awayScore: 0 };
  }

  agencyScoreLabel(matchId: string): string {
    const score = this.agencyScores()[matchId];
    if (!score) {
      return '--';
    }
    return `${score.homeScore} - ${score.awayScore}`;
  }

  userPoints(match: MatchEntity): number | null {
    const score = this.getUserScore(match.id);
    return this.pointsForPrediction(match, score);
  }

  clanPoints(match: MatchEntity): number | null {
    const score = this.agencyScores()[match.id];
    if (!score) {
      return null;
    }
    return this.pointsForPrediction(match, score);
  }

  pointsLabel(points: number | null): string {
    if (points === null || points === undefined) {
      return '--';
    }
    return `+${points} pts`;
  }

  pointsClass(points: number | null): string {
    switch (points) {
      case 3:
        return 'match-card__points-value--exact';
      case 2:
        return 'match-card__points-value--winner-score';
      case 1:
        return 'match-card__points-value--winner';
      case 0:
        return 'match-card__points-value--miss';
      default:
        return 'match-card__points-value--pending';
    }
  }

  setScore(matchId: string, side: 'home' | 'away', value: string) {
    const parsed = Math.max(0, Math.min(20, Number(value || 0)));
    if (!Number.isFinite(parsed)) {
      return;
    }
    const current = this.getUserScore(matchId);
    const next = {
      homeScore: side === 'home' ? parsed : current.homeScore,
      awayScore: side === 'away' ? parsed : current.awayScore,
    };
    this.userScores.set({ ...this.userScores(), [matchId]: next });
  }

  adjustScore(matchId: string, side: 'home' | 'away', delta: number) {
    const current = this.getUserScore(matchId);
    const value = side === 'home' ? current.homeScore : current.awayScore;
    const nextValue = Math.max(0, Math.min(20, value + delta));
    const next = {
      homeScore: side === 'home' ? nextValue : current.homeScore,
      awayScore: side === 'away' ? nextValue : current.awayScore,
    };
    this.userScores.set({ ...this.userScores(), [matchId]: next });
  }

  teamLogoUrl(team: string): string {
    const normalized = this.normalizeTeamName(this.displayTeamName(team));
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

  displayTeamName(team: string): string {
    return officialTeamName(team, (value) => this.normalizeTeamName(value));
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

  isMatchEditable(match: MatchEntity): boolean {
    return match.status === 'UPCOMING';
  }

  hasEditableMatches(): boolean {
    return this.matchesFiltered().some((match) => this.isMatchEditable(match));
  }

  matchResultLabel(match: MatchEntity): string {
    return this.matchScoreLabel(match) ?? 'Resultat indisponible';
  }

  private matchScoreLabel(match: MatchEntity): string | null {
    if (match.homeScore === null || match.homeScore === undefined) {
      return null;
    }
    if (match.awayScore === null || match.awayScore === undefined) {
      return null;
    }
    return `${match.homeScore} - ${match.awayScore}`;
  }

  private pointsForPrediction(match: MatchEntity, predicted: AgencyMatchScore): number | null {
    const actual = this.matchScoreLabel(match);
    if (!actual) {
      return null;
    }
    const actualHome = match.homeScore ?? null;
    const actualAway = match.awayScore ?? null;
    if (actualHome === null || actualAway === null) {
      return null;
    }

    if (predicted.homeScore === actualHome && predicted.awayScore === actualAway) {
      return 3;
    }

    const predictedOutcome = this.matchOutcome(predicted.homeScore, predicted.awayScore);
    const actualOutcome = this.matchOutcome(actualHome, actualAway);
    if (predictedOutcome !== actualOutcome) {
      return 0;
    }

    if (actualOutcome === 'HOME' && predicted.homeScore === actualHome) {
      return 2;
    }
    if (actualOutcome === 'AWAY' && predicted.awayScore === actualAway) {
      return 2;
    }

    return 1;
  }

  private matchOutcome(home: number, away: number) {
    if (home > away) {
      return 'HOME';
    }
    if (away > home) {
      return 'AWAY';
    }
    return 'DRAW';
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

  private weekLabel(offset: number): string {
    switch (offset) {
      case -2:
        return 'Il y a 2 semaines';
      case -1:
        return 'Semaine derniere';
      case 0:
        return 'Semaine actuelle';
      case 1:
        return 'Semaine suivante';
      case 2:
        return 'Dans 2 semaines';
      case 3:
        return 'Dans 3 semaines';
      default:
        return 'Semaine';
    }
  }

  private setDefaultWeek() {
    const now = new Date();
    const options = this.weekOptions();
    const index = options.findIndex((option) => now >= option.start && now <= option.end);
    if (index >= 0) {
      this.selectedWeekIndex.set(index);
    }
  }

  private clearSaveTimeout() {
    if (this.saveTimeout !== undefined) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
    }
  }
}
