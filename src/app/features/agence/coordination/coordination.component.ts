import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AgenceApiService,
  AgencyCoordination,
  AgencyMission,
} from '../../../data-access/agence/agence.api';

@Component({
  selector: 'app-agence-coordination',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './coordination.component.html',
  styleUrl: './coordination.component.css',
})
export class AgenceCoordinationComponent implements OnInit {
  private readonly agenceApi = inject(AgenceApiService);
  private readonly destroyRef = inject(DestroyRef);

  coordination = signal<AgencyCoordination | null>(null);
  loading = signal(false);

  ngOnInit() {
    this.loadCoordination();
  }

  loadCoordination() {
    this.loading.set(true);
    this.agenceApi
      .getCoordination()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (coordination) => {
          this.coordination.set(coordination);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  missions = computed(() => this.coordination()?.missions ?? []);

  stats() {
    return this.coordination()?.stats;
  }

  difficultyLabel(difficulty: AgencyMission['mission']['difficulty']) {
    switch (difficulty) {
      case 'EASY':
        return 'Easy';
      case 'MEDIUM':
        return 'Medium';
      case 'HARD':
        return 'Hard';
      default:
        return 'Legendary';
    }
  }

  difficultyClass(difficulty: AgencyMission['mission']['difficulty']) {
    switch (difficulty) {
      case 'EASY':
        return 'mission-card__tag--easy';
      case 'MEDIUM':
        return 'mission-card__tag--medium';
      case 'HARD':
        return 'mission-card__tag--hard';
      default:
        return 'mission-card__tag--legendary';
    }
  }

  progressPercent(mission: AgencyMission) {
    if (!mission.target) {
      return 0;
    }
    return Math.min(100, Math.round((mission.progress / mission.target) * 100));
  }

  progressLabel(mission: AgencyMission) {
    return `${mission.progress}/${mission.target} completes`;
  }

  rewardLabel(mission: AgencyMission) {
    const parts = [`${mission.mission.rewardXp} XP`];
    if (mission.mission.rewardTrophies) {
      parts.push(`${mission.mission.rewardTrophies} Trophee`);
    }
    return parts.join(' + ');
  }
}
