import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
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

type MetricField = 'verseEarned' | 'betsWon' | 'level' | 'winRate' | 'versePossessedTotal';

@Component({
  selector: 'leaderboard-global',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './global.component.html',
  styleUrl: './global.component.css',
})
export class GlobalComponent implements OnInit {
  private readonly leaderboardApi = inject(LeaderboardApiService);
  private readonly metricField: Record<LeaderboardMetric, MetricField> = {
    VERSE: 'versePossessedTotal',
    WINS: 'winRate',
    LEVEL: 'level',
  };
  private readonly numberFormat = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  });

  readonly metricOptions: LeaderboardMetricOption[] = [
    {
      id: 'VERSE',
      label: 'Plus de Verse possede',
      description: 'Wallet + en cours + investissements',
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
  readonly topPodium = computed(() => {
    const top = this.topPlayers();
    if (top.length <= 1) {
      return top;
    }
    if (top.length === 2) {
      return [top[1], top[0]];
    }
    return [top[1], top[0], top[2]];
  });
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
    if (this.selectedMetric() === 'VERSE') {
      return 100;
    }
    const field = this.metricField[this.selectedMetric()];
    const topValue = this.topMetricValue();
    if (!topValue) {
      return 0;
    }
    const current = entry[field] as number;
    return Math.round((current / topValue) * 100);
  }

  xpProgress(entry: LeaderboardEntry) {
    const currentLevel = entry.level ?? 1;
    const currentXp = entry.xp ?? 0;
    const floor = this.xpForLevel(currentLevel);
    const ceil = this.xpForLevel(currentLevel + 1);
    const needed = Math.max(1, ceil - floor);
    const gained = Math.max(0, currentXp - floor);
    return Math.min(100, Math.max(0, Math.round((gained / needed) * 100)));
  }

  xpCurrent(entry: LeaderboardEntry) {
    const currentLevel = entry.level ?? 1;
    const currentXp = entry.xp ?? 0;
    const floor = this.xpForLevel(currentLevel);
    return Math.max(0, currentXp - floor);
  }

  xpNeeded(entry: LeaderboardEntry) {
    const currentLevel = entry.level ?? 1;
    const floor = this.xpForLevel(currentLevel);
    const ceil = this.xpForLevel(currentLevel + 1);
    return Math.max(1, ceil - floor);
  }

  formatPrimaryValue(entry: LeaderboardEntry) {
    switch (this.selectedMetric()) {
      case 'VERSE':
        return `${this.numberFormat.format(entry.versePossessedTotal)} Verse possedes`;
      case 'WINS':
        return `${entry.betsWon} paris gagnes`;
      case 'LEVEL':
        return `Niveau ${entry.level}`;
    }
  }

  formatSecondaryValue(entry: LeaderboardEntry) {
    switch (this.selectedMetric()) {
      case 'VERSE':
        return `${this.numberFormat.format(entry.verseWallet)} wallet`;
      case 'WINS':
        return `${this.numberFormat.format(entry.verseEarned)} Verse cumules`;
      case 'LEVEL':
        return `${entry.betsWon} paris gagnes`;
    }
  }

  verseSegment(entry: LeaderboardEntry, kind: 'wallet' | 'pending' | 'invested') {
    const total = entry.versePossessedTotal ?? 0;
    if (!total) {
      return 0;
    }
    if (kind === 'wallet') {
      return (entry.verseWallet / total) * 100;
    }
    if (kind === 'pending') {
      return (entry.versePending / total) * 100;
    }
    return (entry.verseInvested / total) * 100;
  }

  trackByMetric(_index: number, option: LeaderboardMetricOption) {
    return option.id;
  }

  trackByEntry(_index: number, entry: LeaderboardEntry) {
    return entry.id;
  }

  private xpForLevel(level: number) {
    const base = 500;
    const growth = 250;
    const safeLevel = Math.max(1, Math.floor(level));
    const steps = safeLevel - 1;
    return Math.max(0, Math.floor(steps * base + (steps * (steps - 1) * growth) / 2));
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
