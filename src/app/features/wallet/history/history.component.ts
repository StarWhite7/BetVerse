import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  WalletApiService,
  WalletTransaction,
} from '../../../data-access/wallet/wallet.api';

type TransactionFilter = 'ALL' | 'CREDIT' | 'DEBIT';

@Component({
  selector: 'app-wallet-history',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './history.component.html',
  styleUrl: './history.component.css',
})
export class WalletHistoryComponent implements OnInit {
  private readonly walletApi = inject(WalletApiService);

  transactions = signal<WalletTransaction[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  filter = signal<TransactionFilter>('ALL');
  startDate = signal<string>('');
  endDate = signal<string>('');

  filteredTransactions = computed(() => {
    const items = this.transactions();
    const typeFilter = this.filter();
    const start = this.startDate();
    const end = this.endDate();
    return items.filter((tx) => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }
      const txDate = new Date(tx.createdAt);
      if (start) {
        const startDate = new Date(start);
        if (txDate < startDate) return false;
      }
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        if (txDate > endDate) return false;
      }
      return true;
    });
  });

  filters: { label: string; value: TransactionFilter }[] = [
    { label: 'Tous', value: 'ALL' },
    { label: 'Credits', value: 'CREDIT' },
    { label: 'Debits', value: 'DEBIT' },
  ];

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.loading.set(true);
    this.error.set(null);
    this.walletApi.getHistory().subscribe({
      next: (tx) => {
        this.transactions.set(tx);
        this.loading.set(false);
      },
      error: () => {
        this.error.set("Impossible de charger les transactions.");
        this.loading.set(false);
      },
    });
  }

  applyFilter(filter: TransactionFilter) {
    this.filter.set(filter);
  }

  updateStartDate(value: string) {
    this.startDate.set(value);
  }

  updateEndDate(value: string) {
    this.endDate.set(value);
  }

  exportCsv() {
    const rows = this.filteredTransactions().map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      createdAt: tx.createdAt,
    }));
    const header = 'id,type,amount,createdAt';
    const data = rows
      .map((row) => `${row.id},${row.type},${row.amount},${row.createdAt}`)
      .join('\n');
    const csv = `${header}\n${data}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  clearDates() {
    this.startDate.set('');
    this.endDate.set('');
  }

  trackByTx(_index: number, tx: WalletTransaction) {
    return tx.id;
  }
}
