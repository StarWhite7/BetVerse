import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../core/config/environment';
import { User } from '../../shared/models/user.model';

export interface UpdateProfilePayload {
  username: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface UserSearchResult {
  id: string;
  username: string;
  email: string;
}

export interface PublicBet {
  id: string;
  match: string;
  betType: string;
  amount: number;
  odds: number;
  status: 'PENDING' | 'WON' | 'LOST';
  createdAt: string;
  matchId?: string | null;
}

export interface PublicProfile {
  user: {
    id: string;
    username?: string | null;
    initials: string;
    level: number;
    xp: number;
  };
  stats: {
    winRate: number;
    betsWon: number;
    betsPlayed: number;
    currentStreak: number;
    verseWallet: number;
    versePending: number;
    versePossessedTotal: number;
  };
  pendingBets: PublicBet[];
  historyBets: PublicBet[];
}

export interface AdminUserSummary {
  id: string;
  username: string | null;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface ResetEconomyResult {
  betsDeleted: number;
  walletsUpdated: number;
  usersUpdated: number;
}

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly baseUrl = `${environment.apiUrl}/users`;

  constructor(private readonly http: HttpClient) {}

  updateProfile(payload: UpdateProfilePayload): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/me`, payload);
  }

  changePassword(payload: ChangePasswordPayload) {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/me/password`, payload);
  }

  searchUsernames(query: string) {
    const params = new HttpParams().set('q', query);
    return this.http.get<UserSearchResult[]>(`${this.baseUrl}/search`, { params });
  }

  getPublicProfile(userId: string) {
    return this.http.get<PublicProfile>(`${this.baseUrl}/${userId}/public`);
  }

  getAdminUsers(query?: string) {
    const params = query ? new HttpParams().set('q', query) : undefined;
    return this.http.get<AdminUserSummary[]>(this.baseUrl, { params });
  }

  addXp() {
    return this.http.patch<User>(`${this.baseUrl}/me/xp/add`, {});
  }

  removeXp() {
    return this.http.patch<User>(`${this.baseUrl}/me/xp/remove`, {});
  }

  resetXp() {
    return this.http.patch<User>(`${this.baseUrl}/me/xp/reset`, {});
  }

  resetEconomy() {
    return this.http.post<ResetEconomyResult>(`${this.baseUrl}/reset-economy`, {});
  }
}
