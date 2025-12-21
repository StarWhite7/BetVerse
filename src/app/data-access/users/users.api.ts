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

  addXp() {
    return this.http.patch<User>(`${this.baseUrl}/me/xp/add`, {});
  }

  removeXp() {
    return this.http.patch<User>(`${this.baseUrl}/me/xp/remove`, {});
  }

  resetXp() {
    return this.http.patch<User>(`${this.baseUrl}/me/xp/reset`, {});
  }
}
