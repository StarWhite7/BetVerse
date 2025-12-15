import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export interface BetEntity {
  id: string;
  match: string;
  betType: string;
  amount: number;
  odds: number;
  status: 'PENDING' | 'WON' | 'LOST';
  createdAt: string;
  matchId?: string | null;
}

export interface CreateBetPayload {
  match?: string;
  matchId?: string;
  betType: string;
  amount: number;
  odds: number;
}

export interface BetsQuery {
  status?: 'PENDING' | 'WON' | 'LOST';
  order?: 'asc' | 'desc';
  limit?: number;
  skip?: number;
}

export interface ResolveBetPayload {
  betId: string;
  result: 'WON' | 'LOST';
}

export interface ResolveBetResponse {
  bet: BetEntity;
  payout: number | null;
}

@Injectable({ providedIn: 'root' })
export class BetsApiService {
  private readonly baseUrl = `${environment.apiUrl}/bet`;

  constructor(private readonly http: HttpClient) {}

  createBet(payload: CreateBetPayload) {
    return this.http.post<BetEntity>(this.baseUrl, payload);
  }

  getMyBets(query: BetsQuery = {}) {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.order) params = params.set('order', query.order);
    if (query.limit !== undefined) params = params.set('limit', query.limit);
    if (query.skip !== undefined) params = params.set('skip', query.skip);

    return this.http.get<BetEntity[]>(`${this.baseUrl}/my-bets`, { params });
  }

  resolveBet(payload: ResolveBetPayload) {
    return this.http.post<ResolveBetResponse>(`${this.baseUrl}/resolve`, payload);
  }
}
