import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ReplaySubject, tap } from 'rxjs';
import { environment } from '../../core/config/environment';

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
}

@Injectable({ providedIn: 'root' })
export class WalletApiService {
  private readonly baseUrl = `${environment.apiUrl}/wallet`;
  private readonly walletSubject = new ReplaySubject<WalletEntity | null>(1);

  constructor(private readonly http: HttpClient) {}

  walletChanges() {
    return this.walletSubject.asObservable();
  }

  clearCachedWallet() {
    this.walletSubject.next(null);
  }

  private pushWallet(wallet: WalletEntity) {
    this.walletSubject.next(wallet);
  }

  getWallet() {
    return this.http.get<WalletEntity>(this.baseUrl).pipe(
      tap((wallet) => {
        this.pushWallet(wallet);
      }),
    );
  }

  getHistory() {
    return this.http.get<WalletTransaction[]>(`${this.baseUrl}/history`);
  }

  claimDailyReward() {
    return this.http.post<WalletEntity>(`${this.baseUrl}/claim`, {}).pipe(
      tap((wallet) => {
        this.pushWallet(wallet);
      }),
    );
  }

  credit(amount: number) {
    return this.http.post<WalletEntity>(`${this.baseUrl}/credit`, { amount }).pipe(
      tap((wallet) => {
        this.pushWallet(wallet);
      }),
    );
  }

  debit(amount: number) {
    return this.http.post<WalletEntity>(`${this.baseUrl}/debit`, { amount }).pipe(
      tap((wallet) => {
        this.pushWallet(wallet);
      }),
    );
  }

  transfer(username: string, amount: number) {
    return this.http
      .post<WalletEntity>(`${this.baseUrl}/transfer`, { username, amount })
      .pipe(
        tap((wallet) => {
          this.pushWallet(wallet);
        }),
      );
  }
}
