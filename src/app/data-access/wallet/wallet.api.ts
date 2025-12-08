import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export interface WalletEntity {
  id: string;
  balance: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
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

  constructor(private readonly http: HttpClient) {}

  getWallet() {
    return this.http.get<WalletEntity>(this.baseUrl);
  }

  getHistory() {
    return this.http.get<WalletTransaction[]>(`${this.baseUrl}/history`);
  }

  credit(amount: number) {
    return this.http.post<WalletEntity>(`${this.baseUrl}/credit`, { amount });
  }

  debit(amount: number) {
    return this.http.post<WalletEntity>(`${this.baseUrl}/debit`, { amount });
  }
}
