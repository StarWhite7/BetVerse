import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../core/config/environment';
import {
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPlayer,
} from './leaderboard.models';

type MetricField = 'verseEarned' | 'betsWon' | 'level' | 'versePossessedTotal';

@Injectable({ providedIn: 'root' })
export class LeaderboardApiService {
  private readonly baseUrl = `${environment.apiUrl}/leaderboard`;
  private readonly metricField: Record<LeaderboardMetric, MetricField> = {
    VERSE: 'versePossessedTotal',
    WINS: 'betsWon',
    LEVEL: 'level',
  };
  private readonly excludedUsernames = new Set(['pierretest', 'test']);

  constructor(private readonly http: HttpClient) {}

  getLeaderboard(metric: LeaderboardMetric): Observable<LeaderboardEntry[]> {
    const params = new HttpParams().set('metric', metric.toLowerCase());

    return this.http.get<LeaderboardPlayer[]>(this.baseUrl, { params }).pipe(
      map((players) => this.sortAndRank(players, metric)),
    );
  }

  private sortAndRank(players: LeaderboardPlayer[], metric: LeaderboardMetric): LeaderboardEntry[] {
    const field = this.metricField[metric];
    return players
      .filter((player) => !this.isExcluded(player))
      .slice()
      .sort((a, b) => Number(b[field]) - Number(a[field]))
      .map<LeaderboardEntry>((player, index) => ({
        ...player,
        rank: index + 1,
      }));
  }

  private isExcluded(player: LeaderboardPlayer) {
    const username = player.username?.trim().toLowerCase();
    return username ? this.excludedUsernames.has(username) : false;
  }
}
