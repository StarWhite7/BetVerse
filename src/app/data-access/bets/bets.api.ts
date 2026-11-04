import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export interface BetEntity {
  id: string;
  match: string;
  betType: string;
  amount: number;
  odds: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  createdAt: string;
  matchId?: string | null;
}

export interface CreateBetPayload {
  match?: string;
  matchId?: string;
  betType: string;
  amount: number;
  odds: number;
  requestKey: string;
}

export interface BetsQuery {
  status?: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  order?: 'asc' | 'desc';
  limit?: number;
  skip?: number;
}

@Injectable({ providedIn: 'root' })
export class BetsApiService {
  private readonly baseUrl = `${environment.apiUrl}/bet`;

  constructor(private readonly http: HttpClient) {}

  createBet(payload: CreateBetPayload) {
    const { requestKey, ...body } = payload;
    return this.http.post<BetEntity>(this.baseUrl, body, {
      headers: { 'Idempotency-Key': requestKey },
    });
  }

  getAdminBets(query: BetsQuery = {}) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params = params.set(key, value);
    return this.http.get<BetEntity[]>(`${this.baseUrl}/admin-bets`, { params });
  }

  getMyBetsPage(query: BetsQuery = {}) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params = params.set(key, value);
    return this.http.get<BetEntity[]>(`${this.baseUrl}/my-bets`, { params, observe: 'response' });
  }

  getMyBets(query: BetsQuery = {}) {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.order) params = params.set('order', query.order);
    if (query.limit !== undefined) params = params.set('limit', query.limit);
    if (query.skip !== undefined) params = params.set('skip', query.skip);

    return this.http.get<BetEntity[]>(`${this.baseUrl}/my-bets`, { params });
  }
}
