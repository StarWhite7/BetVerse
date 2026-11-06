import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WalletApiService } from '../../../data-access/wallet/wallet.api';
import { NotificationService } from '../../../core/services/notification.service';
import { interval } from 'rxjs';

@Component({
  selector: 'app-wallet-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" (click)="claim()" [disabled]="loading() || !available()">
      {{ loading() ? 'En cours…' : available() ? 'Bonus : +500 Verse' : countdown() }}
    </button>
    <div class="balance" aria-live="polite">
      <small>Verse</small><strong>{{ wallet()?.balance ?? 0 | number: '1.0-0' }}</strong>
    </div>
    <div class="balance shards">
      <small>Shards</small><strong>{{ wallet()?.shards ?? 0 | number: '1.0-0' }}</strong>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      flex-wrap: wrap;
    }
    button {
      padding: 0.75rem 1rem;
      border-radius: 2rem;
      border: 0;
      color: white;
      background: var(--bv-primary);
      cursor: pointer;
      font-weight: 600;
    }
    button:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .balance {
      display: flex;
      flex-direction: column;
      padding: 0.4rem 0.8rem;
      min-width: 65px;
      border: 1px solid var(--bv-border);
      border-radius: 1rem;
    }
    small {
      font-size: 0.7rem;
      color: var(--bv-muted);
    }
    strong {
      color: var(--bv-accent);
    }
    .shards strong {
      color: var(--bv-text);
    }
  `,
})
export class WalletStatusComponent {
  private readonly api = inject(WalletApiService);
  private readonly notices = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  wallet = this.api.wallet;
  loading = signal(false);
  clock = signal(Date.now());
  private readonly serverClockOffset = signal(0);
  remaining = computed(
    () =>
      Math.min(
        86400000,
        Math.max(
          0,
          Date.parse(this.wallet()?.nextClaimAvailableAt ?? '') -
            (this.clock() + this.serverClockOffset()),
        ),
      ) || 0,
  );
  available = computed(() => this.wallet() !== null && this.remaining() === 0);
  countdown = computed(() => {
    const seconds = Math.ceil(this.remaining() / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  });
  constructor() {
    effect(() => {
      const serverTime = Date.parse(this.wallet()?.serverTime ?? '');
      const receivedAt = Date.now();
      this.clock.set(receivedAt);
      this.serverClockOffset.set(Number.isFinite(serverTime) ? serverTime - receivedAt : 0);
    });
    this.api
      .getWallet()
      .pipe(takeUntilDestroyed())
      .subscribe({ error: () => this.notices.error('Impossible de charger le portefeuille.') });
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.clock.set(Date.now()));
  }
  claim() {
    if (this.loading() || !this.available()) return;
    this.loading.set(true);
    this.api
      .claimDailyReward()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.notices.success('500 Verse ajoutés à votre portefeuille.');
        },
        error: (error) => {
          this.loading.set(false);
          this.notices.error(error?.error?.message ?? 'Bonus indisponible.');
          this.api
            .getWallet()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => {} });
        },
      });
  }
}
