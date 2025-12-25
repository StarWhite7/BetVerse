import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export interface AgencyEntity {
  id: string;
  name: string;
  logoId: string;
  primaryColor: string;
  secondaryColor: string;
  trophiesCount: number;
  rank: number;
  _count?: { members: number };
  createdAt: string;
  updatedAt: string;
}

export interface AgencyMember {
  id: string;
  username?: string | null;
  email: string;
  agencyRole?: 'DIRECTEUR' | 'ASSOCIE' | 'RESPONSABLE' | 'STAGIAIRE' | null;
  createdAt: string;
  xp?: number | null;
}

export interface AgencyRoster extends AgencyEntity {
  members?: AgencyMember[];
}

export interface AgencyInvite {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  agency: AgencyEntity;
  inviter: { id: string; username?: string | null };
}

@Injectable({ providedIn: 'root' })
export class AgenceApiService {
  private readonly baseUrl = `${environment.apiUrl}/agence`;

  constructor(private readonly http: HttpClient) {}

  getMyAgency() {
    return this.http.get<AgencyEntity | null>(`${this.baseUrl}/me`);
  }

  getRoster() {
    return this.http.get<AgencyRoster | null>(`${this.baseUrl}/roster`);
  }

  listAgencies() {
    return this.http.get<Array<AgencyEntity & { _count?: { members: number } }>>(
      this.baseUrl,
    );
  }

  listCandidates(query: string) {
    return this.http.get<Array<{ id: string; username: string | null }>>(
      `${this.baseUrl}/candidates`,
      {
        params: { q: query },
      },
    );
  }

  invite(username: string) {
    return this.http.post<{ id: string }>(`${this.baseUrl}/invitations`, { username });
  }

  listInvites() {
    return this.http.get<AgencyInvite[]>(`${this.baseUrl}/invitations`);
  }

  acceptInvite(id: string) {
    return this.http.post<{ success: true }>(`${this.baseUrl}/invitations/${id}/accept`, {});
  }

  declineInvite(id: string) {
    return this.http.post<{ success: true }>(`${this.baseUrl}/invitations/${id}/decline`, {});
  }

  updateRole(memberId: string, role: 'DIRECTEUR' | 'ASSOCIE' | 'RESPONSABLE' | 'STAGIAIRE') {
    return this.http.patch<{ success: true }>(`${this.baseUrl}/members/${memberId}/role`, {
      role,
    });
  }

  createAgency(payload: {
    name: string;
    logoId?: string;
    primaryColor?: string;
    secondaryColor?: string;
  }) {
    return this.http.post<AgencyEntity>(this.baseUrl, payload);
  }
}
