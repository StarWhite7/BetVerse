import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatchesApiService, OddsUsageSnapshot } from '../../data-access/matches/matches.api';

@Component({
  selector: 'app-admin-usage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-usage.html',
  styleUrl: './admin-usage.css',
})
export class AdminUsageComponent implements OnInit {
  private readonly matchesApi = inject(MatchesApiService);

  usage = signal<OddsUsageSnapshot | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  lastDelta = signal<number | null>(null);
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
}
