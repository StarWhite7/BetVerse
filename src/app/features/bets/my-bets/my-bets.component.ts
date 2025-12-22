import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BetsStore, BetsFilter } from '../../../data-access/bets/bets.store';
import { AuthService } from '../../../core/services/auth.service';

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
}
