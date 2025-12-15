import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  WalletApiService,
  WalletEntity,
  WalletTransaction,
} from '../../data-access/wallet/wallet.api';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './wallet.html',
  styleUrl: './wallet.css',
})
export class WalletComponent implements OnInit {
  private readonly walletApi = inject(WalletApiService);
  private readonly notifications = inject(NotificationService);

  wallet = signal<WalletEntity | null>(null);
  transactions = signal<WalletTransaction[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  historyLoading = signal(false);
  modalOpen = signal(false);
  modalMode = signal<'credit' | 'debit'>('credit');
  modalAmount = signal(50);
  modalError = signal<string | null>(null);
  submitting = signal(false);
  stats = computed(() => {
    const summary = this.transactions().reduce(
      (acc, tx) => {
        if (tx.type === 'CREDIT') {
          acc.credits += tx.amount;
        } else {
          acc.debits += tx.amount;
        }
        return acc;
      },
      { credits: 0, debits: 0 },
    );
    return summary;
  });
  recentTransactions = computed(() => this.transactions().slice(0, 3));
  get modalAmountValue() {
    return this.modalAmount();
  }
  set modalAmountValue(value: number) {
    this.modalAmount.set(value);
  }

  ngOnInit() {
    this.loadWallet();
  }

  private loadWallet() {
    this.loading.set(true);
    this.error.set(null);

    this.walletApi.getWallet().subscribe({
      next: (wallet) => {
        this.wallet.set(wallet);
        this.loading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.error.set('Impossible de charger le wallet.');
        this.loading.set(false);
      },
    });
  }

  private loadHistory() {
    this.historyLoading.set(true);
    this.walletApi.getHistory().subscribe({
      next: (transactions) => {
        this.transactions.set(transactions);
        this.historyLoading.set(false);
      },
      error: () => {
        this.error.set("Impossible de charger l'historique.");
        this.historyLoading.set(false);
      },
    });
  }

  refreshHistory() {
    if (this.historyLoading()) return;
    this.loadHistory();
  }

  openModal(mode: 'credit' | 'debit') {
    this.modalMode.set(mode);
    this.modalAmount.set(50);
    this.modalError.set(null);
    this.modalOpen.set(true);
  }

  closeModal() {
    if (this.submitting()) return;
    this.modalOpen.set(false);
  }

  submitOperation() {
    const amount = this.modalAmount();
    if (amount <= 0) {
      this.modalError.set('Montant invalide');
      return;
    }
    if (this.modalMode() === 'debit') {
      const balance = this.wallet()?.balance ?? 0;
      if (amount > balance) {
        this.modalError.set('Solde insuffisant pour retirer ce montant.');
        return;
      }
    }

    this.submitting.set(true);
    this.modalError.set(null);

    const request =
      this.modalMode() === 'credit'
        ? this.walletApi.credit(amount)
        : this.walletApi.debit(amount);

    request.subscribe({
      next: (wallet) => {
        this.wallet.set(wallet);
        this.loadHistory();
        this.modalOpen.set(false);
        this.notifications.success(
          this.modalMode() === 'credit' ? 'Depot confirme.' : 'Retrait confirme.',
        );
        this.submitting.set(false);
      },
      error: (err) => {
        const message = err?.error?.message ?? 'Operation impossible.';
        this.modalError.set(message);
        this.notifications.error(message);
        this.submitting.set(false);
      },
    });
  }

  trackByTx(_index: number, tx: WalletTransaction) {
    return tx.id;
  }
}
