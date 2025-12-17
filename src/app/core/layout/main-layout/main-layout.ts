import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WalletApiService, WalletEntity } from '../../../data-access/wallet/wallet.api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UsersApiService } from '../../../data-access/users/users.api';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly walletApi = inject(WalletApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly claimCooldownMs = 24 * 60 * 60 * 1000;
  private readonly claimStoragePrefix = 'betverse_next_claim_';

  user = computed(() => this.auth.currentUser());
  wallet = signal<WalletEntity | null>(null);
  walletLoading = signal(false);
  claimLoading = signal(false);
  nextClaimTime = signal<number | null>(null);
  claimCountdown = signal('');
  claimAvailable = computed(() => this.nextClaimTime() === null);
  usernamePromptVisible = signal(false);
  usernamePromptSubmitting = signal(false);
  usernamePromptForm = this.fb.nonNullable.group({
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
  profileInitials = computed(() => {
    const current = this.user();
    if (!current) {
      return 'BV';
    }
    const source = current.username ?? current.email ?? '';
    const letters = source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2);
    return letters ? letters.toUpperCase() : 'BV';
  });
  profileLabel = computed(() => {
    const current = this.user();
    if (!current) {
      return 'Profil';
    }
    return current.username ?? current.email ?? 'Profil';
  });
  hasWalletAccess = computed(() => this.user()?.role === 'ADMIN');
  hasAdminAccess = computed(() => this.user()?.role === 'ADMIN');

  private readonly claimStorageEffect = effect(() => {
    const currentUser = this.user();
    if (!currentUser) {
      this.clearStoredNextClaimTime();
      this.nextClaimTime.set(null);
      this.claimCountdown.set('');
      return;
    }

    const stored = this.getStoredNextClaimTime(currentUser.id);
    if (!stored) {
      this.nextClaimTime.set(null);
      return;
    }

    this.nextClaimTime.set(stored);
  });

  private readonly usernamePromptEffect = effect(() => {
    const current = this.user();
    if (!current) {
      this.usernamePromptVisible.set(false);
      this.usernamePromptForm.reset();
      return;
    }

    if (!current.username) {
      const fallback = this.deriveUsernameFromEmail(current.email);
      this.usernamePromptVisible.set(true);
      this.usernamePromptForm.reset({ username: fallback });
    } else {
      this.usernamePromptVisible.set(false);
    }
  });

  private readonly claimCountdownEffect = effect((onCleanup) => {
    const nextTime = this.nextClaimTime();
    if (!nextTime) {
      this.claimCountdown.set('');
      return;
    }

    const updateCountdown = () => {
      const remaining = nextTime - Date.now();
      if (remaining <= 0) {
        this.nextClaimTime.set(null);
        this.clearStoredNextClaimTime();
        this.claimCountdown.set('');
        return;
      }

      this.claimCountdown.set(this.formatDuration(remaining));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    onCleanup(() => clearInterval(interval));
  });

  ngOnInit() {
    this.walletApi
      .walletChanges()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((wallet) => {
        this.wallet.set(wallet);
        this.syncClaimWindowFromWallet(wallet);
      });
    this.loadWallet();
  }

  logout() {
    this.walletApi.clearCachedWallet();
    this.auth.logout();
  }

  submitUsernamePrompt() {
    if (this.usernamePromptForm.invalid || this.usernamePromptSubmitting()) {
      this.usernamePromptForm.markAllAsTouched();
      return;
    }

    const username = this.sanitizeUsername(this.usernamePromptForm.controls.username.value);
    this.usernamePromptSubmitting.set(true);
    this.usersApi
      .updateProfile({ username })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.usernamePromptSubmitting.set(false);
          this.auth.syncUser(user);
          this.notifications.success('Pseudo mis a jour.');
        },
        error: () => {
          this.usernamePromptSubmitting.set(false);
          this.notifications.error("Impossible d'enregistrer le pseudo.");
        },
      });
  }

  claimDailyVerses() {
    if (this.claimLoading() || !this.claimAvailable()) {
      return;
    }

    this.claimLoading.set(true);
    this.walletApi
      .claimDailyReward()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (wallet) => {
          const hasServerData = this.syncClaimWindowFromWallet(wallet);
          if (!hasServerData) {
            this.scheduleNextClaim();
          }
          this.claimLoading.set(false);
        },
        error: () => {
          this.claimLoading.set(false);
        },
      });
  }

  private loadWallet() {
    this.walletLoading.set(true);
    this.walletApi
      .getWallet()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.walletLoading.set(false);
        },
        error: () => {
          this.walletApi.clearCachedWallet();
          this.walletLoading.set(false);
        },
      });
  }

  private syncClaimWindowFromWallet(wallet: WalletEntity | null): boolean {
    if (!wallet) {
      return false;
    }

    if (wallet.nextClaimAvailableAt === undefined) {
      return false;
    }

    if (wallet.nextClaimAvailableAt === null) {
      this.clearStoredNextClaimTime();
      this.nextClaimTime.set(null);
      return true;
    }

    const timestamp = new Date(wallet.nextClaimAvailableAt).getTime();
    this.setNextClaimTime(timestamp);
    return true;
  }

  private scheduleNextClaim() {
    const target = Date.now() + this.claimCooldownMs;
    this.setNextClaimTime(target);
  }

  private setNextClaimTime(timestamp: number) {
    this.nextClaimTime.set(timestamp);
    this.persistNextClaimTime(timestamp);
  }

  private formatDuration(ms: number) {
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  private getStoredNextClaimTime(userId: string) {
    if (!this.canUseStorage) {
      return null;
    }

    const value = localStorage.getItem(this.storageKey(userId));
    if (!value) {
      return null;
    }

    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) {
      localStorage.removeItem(this.storageKey(userId));
      return null;
    }

    if (timestamp <= Date.now()) {
      localStorage.removeItem(this.storageKey(userId));
      return null;
    }

    return timestamp;
  }

  private persistNextClaimTime(timestamp: number) {
    const currentUser = this.user();
    if (!currentUser || !this.canUseStorage) {
      return;
    }

    localStorage.setItem(this.storageKey(currentUser.id), String(timestamp));
  }

  private clearStoredNextClaimTime() {
    const currentUser = this.user();
    if (!currentUser || !this.canUseStorage) {
      return;
    }

    localStorage.removeItem(this.storageKey(currentUser.id));
  }

  private get canUseStorage() {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private storageKey(userId: string) {
    return `${this.claimStoragePrefix}${userId}`;
  }

  private deriveUsernameFromEmail(email: string) {
    return (email?.split('@')[0] ?? 'betverse').toLowerCase();
  }

  private sanitizeUsername(value: string) {
    return value.trim().toLowerCase();
  }
}
