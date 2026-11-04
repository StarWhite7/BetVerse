import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export type MatchStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'CANCELLED';
export type MatchResult = 'HOME' | 'AWAY' | 'DRAW';

export interface MatchEntity {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
  status: MatchStatus;
  result?: MatchResult | null;
  homeScore?: number | null;
  awayScore?: number | null;
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

  finishMatch(id: string, result: MatchResult, homeScore: number, awayScore: number) {
    return this.http.post<MatchEntity>(`${this.baseUrl}/${id}/finish`, {
      result,
      homeScore,
      awayScore,
    });
  }
  cancelMatch(id: string, reason: string) {
    return this.http.post<MatchEntity>(`${this.baseUrl}/${id}/cancel`, { reason });
  }
}
