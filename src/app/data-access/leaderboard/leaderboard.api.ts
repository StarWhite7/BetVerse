import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../core/config/environment';
import { LeaderboardEntry, LeaderboardMetric } from './leaderboard.models';
@Injectable({ providedIn: 'root' })
export class LeaderboardApiService {
  constructor(private readonly http: HttpClient) {}
  getLeaderboard(metric: LeaderboardMetric) {
    const params = new HttpParams().set('metric', metric.toLowerCase());
    return this.http.get<LeaderboardEntry[]>(`${environment.apiUrl}/leaderboard`, { params });
  }
}
