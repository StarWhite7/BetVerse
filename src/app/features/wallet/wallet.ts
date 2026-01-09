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
import { AuthService } from '../../core/services/auth.service';
import { UsersApiService, UserSearchResult } from '../../data-access/users/users.api';

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
  private readonly auth = inject(AuthService);
  private readonly usersApi = inject(UsersApiService);
  private usernameSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastUsernameQuery = '';

  wallet = signal<WalletEntity | null>(null);
  transactions = signal<WalletTransaction[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  historyLoading = signal(false);
  modalOpen = signal(false);
  modalMode = signal<'credit' | 'debit' | 'transfer'>('credit');
  modalAmount = signal(50);
  transferUsername = signal('');
  usernameSuggestions = signal<UserSearchResult[]>([]);
  usernameSearchLoading = signal(false);
  usernameSearchPerformed = signal(false);
  modalError = signal<string | null>(null);
  submitting = signal(false);
  usernameDropdownVisible = computed(() => {
    if (this.modalMode() !== 'transfer') {
      return false;
    }
    return (
      this.usernameSearchLoading() ||
      this.usernameSuggestions().length > 0 ||
      this.usernameSearchPerformed()
    );
  });
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
  get transferUsernameValue() {
    return this.transferUsername();
  }
  set transferUsernameValue(value: string) {
    this.handleUsernameInput(value);
  }
  canTransfer = computed(() => this.auth.currentUser()?.role === 'ADMIN');

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

  openModal(mode: 'credit' | 'debit' | 'transfer') {
    this.modalMode.set(mode);
    this.modalAmount.set(50);
    this.resetTransferAutocomplete();
    this.modalError.set(null);
    this.modalOpen.set(true);
    if (mode === 'transfer') {
      this.triggerUsernameSearch('', false);
    }
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
    if (this.modalMode() === 'debit' || this.modalMode() === 'transfer') {
      const balance = this.wallet()?.balance ?? 0;
      if (amount > balance) {
        this.modalError.set('Solde insuffisant pour retirer ce montant.');
        return;
      }
    }

    if (this.modalMode() === 'transfer') {
      const username = this.transferUsername().trim();
      if (!username) {
        this.modalError.set("Pseudo destinataire requis.");
        return;
      }
    }

    this.submitting.set(true);
    this.modalError.set(null);

    let request;
    if (this.modalMode() === 'credit') {
      request = this.walletApi.credit(amount);
    } else if (this.modalMode() === 'debit') {
      request = this.walletApi.debit(amount);
    } else {
      request = this.walletApi.transfer(this.transferUsername().trim(), amount);
    }

    request.subscribe({
      next: (wallet) => {
        this.wallet.set(wallet);
        this.loadHistory();
        this.modalOpen.set(false);
        let message = '';
        if (this.modalMode() === 'credit') {
          message = 'Depot confirme.';
        } else if (this.modalMode() === 'debit') {
          message = 'Retrait confirme.';
        } else {
          message = 'Transfert effectue.';
        }
        this.notifications.success(message);
        this.submitting.set(false);
      },
      error: (err) => {
        const message = err?.error?.message ?? 'Opération impossible.';
        this.modalError.set(message);
        this.notifications.error(message);
        this.submitting.set(false);
      },
    });
  }

  trackByTx(_index: number, tx: WalletTransaction) {
    return tx.id;
  }

  handleUsernameInput(value: string) {
    this.transferUsername.set(value);
    const trimmed = value.trim();
    if (!trimmed) {
      this.triggerUsernameSearch('', false);
      return;
    }
    this.triggerUsernameSearch(trimmed, true);
  }

  selectUsername(username: string) {
    this.transferUsername.set(username);
    this.lastUsernameQuery = username;
    this.usernameSuggestions.set([]);
    this.usernameSearchLoading.set(false);
    this.usernameSearchPerformed.set(false);
    if (this.usernameSearchTimeout) {
      clearTimeout(this.usernameSearchTimeout);
      this.usernameSearchTimeout = null;
    }
  }

  private resetTransferAutocomplete() {
    this.transferUsername.set('');
    this.lastUsernameQuery = '';
    this.usernameSuggestions.set([]);
    this.usernameSearchLoading.set(false);
    this.usernameSearchPerformed.set(false);
    if (this.usernameSearchTimeout) {
      clearTimeout(this.usernameSearchTimeout);
      this.usernameSearchTimeout = null;
    }
  }

  private triggerUsernameSearch(query: string, debounce: boolean) {
    const normalized = query.trim();
    if (this.usernameSearchTimeout) {
      clearTimeout(this.usernameSearchTimeout);
      this.usernameSearchTimeout = null;
    }

    this.lastUsernameQuery = normalized;
    this.usernameSearchPerformed.set(true);
    this.usernameSearchLoading.set(true);

    const execute = () => {
      this.performUsernameSearch(normalized);
    };

    if (debounce) {
      this.usernameSearchTimeout = setTimeout(() => {
        this.usernameSearchTimeout = null;
        execute();
      }, 250);
    } else {
      execute();
    }
  }

  private performUsernameSearch(query: string) {
    if (this.usernameSearchTimeout) {
      clearTimeout(this.usernameSearchTimeout);
      this.usernameSearchTimeout = null;
    }

    const currentQuery = query;
    this.usersApi.searchUsernames(currentQuery).subscribe({
      next: (users) => {
        if (this.lastUsernameQuery !== currentQuery) {
          return;
        }
        this.usernameSuggestions.set(users);
        this.usernameSearchLoading.set(false);
      },
      error: () => {
        if (this.lastUsernameQuery !== currentQuery) {
          return;
        }
        this.usernameSuggestions.set([]);
        this.usernameSearchLoading.set(false);
      },
    });
  }
}
