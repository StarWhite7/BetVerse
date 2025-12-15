import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  WalletApiService,
  WalletEntity,
  WalletTransaction,
} from '../../data-access/wallet/wallet.api';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly walletApi = inject(WalletApiService);
  private readonly notifications = inject(NotificationService);

  user = computed(() => this.auth.currentUser());
  wallet = signal<WalletEntity | null>(null);
  transactions = signal<WalletTransaction[]>([]);
  profileLoading = signal(false);
  walletLoading = signal(false);
  historyLoading = signal(false);
  error = signal<string | null>(null);
  transactionsPreview = computed(() => this.transactions().slice(0, 5));

  ngOnInit() {
    this.refreshAll(false);
  }

  refreshAll(showToast = true) {
    this.refreshProfile(showToast);
    this.loadWallet();
    this.loadTransactions();
  }

  manualRefresh() {
    this.refreshAll(true);
  }

  refreshTransactions() {
    if (this.historyLoading()) return;
    this.loadTransactions();
  }

  private refreshProfile(showToast: boolean) {
    this.profileLoading.set(true);
    this.error.set(null);
    this.auth.fetchProfile().subscribe({
      next: (user: User | null) => {
        this.profileLoading.set(false);
        if (!user) {
          this.error.set("Impossible de charger le profil.");
          return;
        }
        if (showToast) {
          this.notifications.success('Profil mis a jour.');
        }
      },
      error: () => {
        this.profileLoading.set(false);
        this.error.set("Impossible de charger le profil.");
        this.notifications.error("Echec du rafraichissement du profil.");
      },
    });
  }

  private loadWallet() {
    this.walletLoading.set(true);
    this.walletApi.getWallet().subscribe({
      next: (wallet) => {
        this.wallet.set(wallet);
        this.walletLoading.set(false);
      },
      error: () => {
        this.wallet.set(null);
        this.walletLoading.set(false);
        this.notifications.error("Impossible de charger le wallet.");
      },
    });
  }

  private loadTransactions() {
    this.historyLoading.set(true);
    this.walletApi.getHistory().subscribe({
      next: (tx) => {
        this.transactions.set(tx);
        this.historyLoading.set(false);
      },
      error: () => {
        this.transactions.set([]);
        this.historyLoading.set(false);
      },
    });
  }

  trackByTx(_index: number, tx: WalletTransaction) {
    return tx.id;
  }
}
import { User } from '../../shared/models/user.model';
