import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export type MatchStatus = 'UPCOMING' | 'LIVE' | 'FINISHED';
export type MatchResult = 'HOME' | 'AWAY' | 'DRAW';

export interface MatchEntity {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
  status: MatchStatus;
  result?: MatchResult | null;
  oddsHome: number;
  oddsAway: number;
  oddsDraw?: number | null;
  sportTitle?: string | null;
  sport?: string | null;
  sportKey?: string | null;
  league?: string | null;
  competition?: string | null;
}

export interface CreateMatchPayload {
  homeTeam: string;
  awayTeam: string;
  startDate: string;
  sportKey?: string | null;
  sportTitle?: string | null;
  league?: string | null;
  competition?: string | null;
  oddsHome: number;
  oddsAway: number;
  oddsDraw?: number | null;
}

export interface UpdateMatchPayload extends Partial<CreateMatchPayload> {
  status?: MatchStatus;
}

export interface OddsUsageSnapshot {
  remaining: number | null;
  used: number | null;
  total: number | null;
  lastCallAt: string | null;
}

export interface SyncMatchesPayload {
  next?: number;
  last?: number;
  sports?: string[];
  force?: boolean;
}

@Injectable({ providedIn: 'root' })
export class MatchesApiService {
  private readonly baseUrl = `${environment.apiUrl}/matches`;

  constructor(private readonly http: HttpClient) {}

  getMatches(status?: MatchStatus) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<MatchEntity[]>(this.baseUrl, { params });
  }

  getMatch(id: string) {
    return this.http.get<MatchEntity>(`${this.baseUrl}/${id}`);
  }

  createMatch(payload: CreateMatchPayload) {
    return this.http.post<MatchEntity>(this.baseUrl, payload);
  }

  updateMatch(id: string, payload: UpdateMatchPayload) {
    return this.http.patch<MatchEntity>(`${this.baseUrl}/${id}`, payload);
  }

  finishMatch(id: string, result: MatchResult) {
    return this.http.post<MatchEntity>(`${this.baseUrl}/${id}/finish`, { result });
  }

  getOddsUsage() {
    return this.http.get<OddsUsageSnapshot>(`${this.baseUrl}/usage`);
  }

  syncMatches(payload: SyncMatchesPayload = {}) {
    return this.http.post<{ sports: string[]; events: number; upserts: number }>(
      `${this.baseUrl}/sync`,
      payload,
    );
  }
}
