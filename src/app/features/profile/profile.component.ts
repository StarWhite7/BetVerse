import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  WalletApiService,
  WalletEntity,
  WalletTransaction,
} from '../../data-access/wallet/wallet.api';
import { NotificationService } from '../../core/services/notification.service';
import { UsersApiService } from '../../data-access/users/users.api';
import { User } from '../../shared/models/user.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly walletApi = inject(WalletApiService);
  private readonly notifications = inject(NotificationService);
  private readonly usersApi = inject(UsersApiService);
  private readonly fb = inject(FormBuilder);

  user = computed(() => this.auth.currentUser());
  displayName = computed(() => this.user()?.username ?? this.user()?.email ?? 'Profil');
  wallet = signal<WalletEntity | null>(null);
  transactions = signal<WalletTransaction[]>([]);
  profileLoading = signal(false);
  walletLoading = signal(false);
  historyLoading = signal(false);
  usernameSubmitting = signal(false);
  passwordSubmitting = signal(false);
  error = signal<string | null>(null);
  transactionsPreview = computed(() => this.transactions().slice(0, 5));
  hasWalletAccess = computed(() => this.user()?.role === 'ADMIN');

  usernameForm = this.fb.nonNullable.group({
    username: [
      '',
      [
       Validators.required,
       Validators.minLength(3),
       Validators.maxLength(24),
       Validators.pattern(/^[a-zA-Z0-9_.-]+$/),
      ],
    ],
  });
  passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  private readonly syncUsernameEffect = effect(() => {
    const current = this.user();
    if (!current) {
      this.usernameForm.reset();
      return;
    }

    const value = current.username ?? this.deriveUsernameFromEmail(current.email);
    this.usernameForm.reset({ username: value });
  });

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

  onUsernameSubmit() {
    if (this.usernameForm.invalid || !this.usernameForm.dirty || this.usernameSubmitting()) {
      return;
    }

    const username = this.sanitizeUsername(this.usernameForm.controls.username.value);
    this.usernameSubmitting.set(true);
    this.usersApi.updateProfile({ username }).subscribe({
      next: (user) => {
        this.auth.syncUser(user);
        this.usernameSubmitting.set(false);
        this.usernameForm.markAsPristine();
        this.notifications.success("Nom d'utilisateur mis a jour.");
      },
      error: () => {
        this.usernameSubmitting.set(false);
        this.notifications.error("Impossible de mettre a jour le nom d'utilisateur.");
      },
    });
  }

  onPasswordSubmit() {
    if (this.passwordForm.invalid || this.passwordSubmitting()) {
      return;
    }

    this.passwordSubmitting.set(true);
    const payload = this.passwordForm.getRawValue();
    this.usersApi.changePassword(payload).subscribe({
      next: () => {
        this.passwordSubmitting.set(false);
        this.passwordForm.reset();
        this.notifications.success('Mot de passe modifie.');
      },
      error: () => {
        this.passwordSubmitting.set(false);
        this.notifications.error('Impossible de modifier le mot de passe.');
      },
    });
  }

  private refreshProfile(showToast: boolean) {
    this.profileLoading.set(true);
    this.error.set(null);
    this.auth.fetchProfile().subscribe({
      next: (user: User | null) => {
        this.profileLoading.set(false);
        if (!user) {
          this.error.set('Impossible de charger le profil.');
          return;
        }
        if (showToast) {
          this.notifications.success('Profil mis a jour.');
        }
      },
      error: () => {
        this.profileLoading.set(false);
        this.error.set('Impossible de charger le profil.');
        this.notifications.error('Echec du rafraichissement du profil.');
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
        this.notifications.error('Impossible de charger le wallet.');
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

  private deriveUsernameFromEmail(email: string) {
    return (email.split('@')[0] ?? '').toLowerCase();
  }

  private sanitizeUsername(value: string) {
    return value.trim();
  }
}
