import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../core/config/environment';
import { Subject, tap } from 'rxjs';

export interface UserNotification {
  id: string;
  type:
    | 'AGENCY_INVITE'
    | 'AGENCY_INVITE_ACCEPTED'
    | 'AGENCY_INVITE_DECLINED'
    | 'BET_WON'
    | 'BET_REFUNDED'
    | 'BET_CORRECTED';
  title: string;
  message: string;
  metadata?: {
    match?: string;
    betType?: string;
    amount?: number;
    odds?: number;
    payout?: number;
  } | null;
  readAt: string | null;
  createdAt: string;
  agencyId?: string | null;
  inviteId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  readonly changes = new Subject<void>();
  private readonly baseUrl = `${environment.apiUrl}/notifications`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<UserNotification[]>(this.baseUrl);
  }

  unreadCount() {
    return this.http.get<number>(`${this.baseUrl}/unread-count`);
  }

  markRead(id: string) {
    return this.http
      .patch<{ success: true }>(`${this.baseUrl}/${id}/read`, {})
      .pipe(tap(() => this.changes.next()));
  }

  markAllRead() {
    return this.http
      .post<{ success: true }>(`${this.baseUrl}/read-all`, {})
      .pipe(tap(() => this.changes.next()));
  }

  deleteRead() {
    return this.http
      .delete<{ success: true }>(`${this.baseUrl}/read`)
      .pipe(tap(() => this.changes.next()));
  }
}
