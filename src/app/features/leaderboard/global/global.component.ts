import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LeaderboardApiService } from '../../../data-access/leaderboard/leaderboard.api';
import {
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardMetricOption,
} from '../../../data-access/leaderboard/leaderboard.models';

type MetricField = 'verseEarned' | 'betsWon' | 'level';

@Component({
  selector: 'leaderboard-global',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global.component.html',
  styleUrl: './global.component.css',
})
export class GlobalComponent implements OnInit {
  private readonly leaderboardApi = inject(LeaderboardApiService);
  private readonly metricField: Record<LeaderboardMetric, MetricField> = {
   VERSE: 'verseEarned',
    WINS: 'betsWon',
    LEVEL: 'level',
  };
  private readonly numberFormat = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  });

  readonly metricOptions: LeaderboardMetricOption[] = [
    {
      id: 'VERSE',
      label: 'Plus de Verse gagnes',
      description: 'Gains cumules toutes competitions',
    },
    {
      id: 'WINS',
      label: 'Plus de paris gagnes',
      description: 'Regularite et lecture du marche',
    },
    {
      id: 'LEVEL',
      label: 'Plus haut niveau',
      description: 'Progression par missions et XP',
    },
  ];

  readonly selectedMetric = signal<LeaderboardMetric>('VERSE');
  readonly players = signal<LeaderboardEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly topPlayers = computed(() => this.players().slice(0, 3));
  readonly otherPlayers = computed(() => this.players().slice(3));
  readonly activeMetric = computed(
    () => this.metricOptions.find((option) => option.id === this.selectedMetric()) ?? this.metricOptions[0],
  );
  readonly topMetricValue = computed(() => {
    const field = this.metricField[this.selectedMetric()];
    const leaderboard = this.players();
    const top = leaderboard[0];
    return top ? (top[field] as number) : 0;
  });

  ngOnInit(): void {
    this.loadLeaderboard();
  }

  selectMetric(metric: LeaderboardMetric) {
    if (metric === this.selectedMetric()) {
      return;
    }
    this.selectedMetric.set(metric);
    this.loadLeaderboard();
  }

  reload() {
    this.loadLeaderboard();
  }

  progressValue(entry: LeaderboardEntry) {
    const field = this.metricField[this.selectedMetric()];
    const topValue = this.topMetricValue();
    if (!topValue) {
      return 0;
    }
    const current = entry[field] as number;
    return Math.round((current / topValue) * 100);
  }

  formatPrimaryValue(entry: LeaderboardEntry) {
    switch (this.selectedMetric()) {
      case 'VERSE':
        return `${this.numberFormat.format(entry.verseEarned)} Verse`;
      case 'WINS':
        return `${entry.betsWon} paris gagnes`;
      case 'LEVEL':
        return `Niveau ${entry.level}`;
    }
  }

  formatSecondaryValue(entry: LeaderboardEntry) {
    switch (this.selectedMetric()) {
      case 'VERSE':
        return `${entry.betsWon} paris gagnes`;
      case 'WINS':
        return `${this.numberFormat.format(entry.verseEarned)} Verse cumules`;
      case 'LEVEL':
        return `${entry.betsWon} paris gagnes`;
    }
  }

  trackByMetric(_index: number, option: LeaderboardMetricOption) {
    return option.id;
  }

  trackByEntry(_index: number, entry: LeaderboardEntry) {
    return entry.id;
  }

  private loadLeaderboard() {
    this.loading.set(true);
    this.error.set(null);

    firstValueFrom(this.leaderboardApi.getLeaderboard(this.selectedMetric()))
      .then((entries) => this.players.set(entries))
      .catch(() => this.error.set('Impossible de charger le classement.'))
      .finally(() => this.loading.set(false));
  }
}
