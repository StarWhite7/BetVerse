import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BetsStore, BetsFilter } from '../../../data-access/bets/bets.store';
import { AuthService } from '../../../core/services/auth.service';
import { officialTeamName } from '../../../shared/team-names';

@Component({
  selector: 'bets-my-bets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-bets.component.html',
  styleUrl: './my-bets.component.css',
})
export class MyBetsComponent implements OnInit {
  private readonly betsStore = inject(BetsStore);
  private readonly auth = inject(AuthService);

  filters: { label: string; value: BetsFilter }[] = [
    { label: 'Tous', value: 'ALL' },
    { label: 'En attente', value: 'PENDING' },
    { label: 'Gagnes', value: 'WON' },
    { label: 'Perdus', value: 'LOST' },
  ];

  bets = this.betsStore.bets;
  loading = this.betsStore.loading;
  error = this.betsStore.error;
  activeFilter = this.betsStore.filter;
  isAdmin = computed(() => this.auth.currentUser()?.role === 'ADMIN');
  columnCount = computed(() => (this.isAdmin() ? 7 : 6));

  ngOnInit() {
    this.betsStore.load();
  }

  selectFilter(filter: BetsFilter) {
    if (this.activeFilter() === filter) return;
    this.betsStore.setFilter(filter);
  }

  trackByBet(_index: number, bet: { id: string }) {
    return bet.id;
  }


  matchLabel(bet: { match?: string | null }): string {
    const match = bet.match ?? '';
    const parts = match.split(/\s+vs\s+/i);
    if (parts.length >= 2) {
      const home = this.displayTeamName(parts[0].trim());
      const away = this.displayTeamName(parts[1].trim());
      return `${home} vs ${away}`;
    }
    return match;
  }

  betLabel(bet: { betType: string; match?: string | null }): string {
    if (bet.betType === 'DRAW') {
      return 'Match nul';
    }
    const match = bet.match ?? '';
    const parts = match.split(/\s+vs\s+/i);
    if (parts.length >= 2) {
      const home = this.displayTeamName(parts[0].trim());
      const away = this.displayTeamName(parts[1].trim());
      if (bet.betType === 'HOME') return home;
      if (bet.betType === 'AWAY') return away;
    }
    return bet.betType;
  }

  private normalizeTeamName(team: string): string {
    return team
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private displayTeamName(team: string): string {
    return officialTeamName(team, (value) => this.normalizeTeamName(value));
  }
}
