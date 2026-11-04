import { Injectable, effect, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ReplaySubject, tap } from 'rxjs';
import { environment } from '../../core/config/environment';
import { AuthService } from '../../core/services/auth.service';

export interface WalletEntity {
  id: string;
  balance: number;
  shards: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
  nextClaimAvailableAt?: string | null;
}

export interface WalletTransaction {
  id: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  createdAt: string;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class WalletApiService {
  readonly wallet = signal<WalletEntity | null>(null);
  private readonly baseUrl = `${environment.apiUrl}/wallet`;
  private readonly walletSubject = new ReplaySubject<WalletEntity | null>(1);

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {
    let version = this.auth.sessionVersion();
    effect(() => {
      const current = this.auth.sessionVersion();
      if (version !== current) {
        version = current;
        this.clearCachedWallet();
      }
    });
  }

  walletChanges() {
    return this.walletSubject.asObservable();
  }

  clearCachedWallet() {
    this.wallet.set(null);
    this.walletSubject.next(null);
  }

  private pushWallet(wallet: WalletEntity) {
    if (wallet.userId !== this.auth.currentUser()?.id) return;
    this.wallet.set(wallet);
    this.walletSubject.next(wallet);
  }

  getWallet() {
    return this.http.get<WalletEntity>(this.baseUrl).pipe(
      tap((wallet) => {
        this.pushWallet(wallet);
      }),
    );
  }

  getHistory(skip = 0, limit = 25) {
    return this.http.get<WalletTransaction[]>(`${this.baseUrl}/history`, {
      params: new HttpParams().set('skip', skip).set('limit', limit),
    });
  }

  claimDailyReward() {
    return this.http.post<WalletEntity>(`${this.baseUrl}/claim`, {}).pipe(
      tap((wallet) => {
        this.pushWallet(wallet);
      }),
    );
  }

  credit(amount: number, requestKey = crypto.randomUUID()) {
    return this.http
      .post<WalletEntity>(
        `${this.baseUrl}/credit`,
        { amount },
        { headers: { 'Idempotency-Key': requestKey } },
      )
      .pipe(
        tap((wallet) => {
          this.pushWallet(wallet);
        }),
      );
  }

  debit(amount: number, requestKey = crypto.randomUUID()) {
    return this.http
      .post<WalletEntity>(
        `${this.baseUrl}/debit`,
        { amount },
        { headers: { 'Idempotency-Key': requestKey } },
      )
      .pipe(
        tap((wallet) => {
          this.pushWallet(wallet);
        }),
      );
  }

  transfer(username: string, amount: number, requestKey = crypto.randomUUID()) {
    return this.http
      .post<WalletEntity>(
        `${this.baseUrl}/transfer`,
        { username, amount },
        { headers: { 'Idempotency-Key': requestKey } },
      )
      .pipe(
        tap((wallet) => {
          this.pushWallet(wallet);
        }),
      );
  }
}
