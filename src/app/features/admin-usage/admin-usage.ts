import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import {
  MatchesApiService,
  OddsUsageSnapshot,
} from '../../data-access/matches/matches.api';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-admin-usage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-usage.html',
  styleUrl: './admin-usage.css',
})
export class AdminUsageComponent implements OnInit {
  private readonly matchesApi = inject(MatchesApiService);
  private readonly notifications = inject(NotificationService);

  usage = signal<OddsUsageSnapshot | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  lastDelta = signal<number | null>(null);
  syncing = signal(false);
  refreshApiLabel = computed(() =>
    this.syncing() ? 'Sync en cours...' : "Rafraichir l'API",
  );
  private lastUsed: number | null = null;

  ngOnInit() {
    this.loadUsage();
  }

  loadUsage() {
    this.loading.set(true);
    this.error.set(null);
    this.matchesApi.getOddsUsage().subscribe({
      next: (snapshot) => {
        this.usage.set(snapshot);
        if (snapshot.used !== null && this.lastUsed !== null) {
          const delta = snapshot.used - this.lastUsed;
          this.lastDelta.set(delta > 0 ? delta : 0);
        } else {
          this.lastDelta.set(snapshot.used ?? null);
        }
        this.lastUsed = snapshot.used;
        this.loading.set(false);
      },
      error: () => {
        this.error.set("Impossible de recuperer les statistiques d'API.");
        this.loading.set(false);
      },
    });
  }

  syncApi() {
    if (this.syncing() || this.loading()) {
      return;
    }
    this.syncing.set(true);
    this.matchesApi.syncMatches({ force: true }).subscribe({
      next: (result) => {
        this.syncing.set(false);
        this.notifications.success(
          `Sync API ok (${result.upserts ?? 0} matchs mis a jour).`,
        );
        this.loadUsage();
      },
      error: () => {
        this.syncing.set(false);
        this.notifications.error("Impossible de rafraichir l'API.");
      },
    });
  }
}
