import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export interface AgencyEntity {
  id: string;
  name: string;
  logoId: string;
  primaryColor: string;
  secondaryColor: string;
  bannerStyle?: 'grid' | 'waves' | 'rain' | 'circuit';
  xp: number;
  level: number;
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
  agencyRole?: 'DIRECTEUR' | 'ASSOCIE' | 'RESPONSABLE' | 'MEMBRE' | 'STAGIAIRE' | null;
  createdAt: string;
  xp?: number | null;
}

export interface AgencyRoster extends AgencyEntity {
  members?: AgencyMember[];
}

export type MissionDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'LEGENDARY';
export type AgencyMissionStatus = 'ACTIVE' | 'COMPLETED' | 'LOCKED';

export interface AgencyMission {
  id: string;
  status: AgencyMissionStatus;
  progress: number;
  target: number;
  dueAt?: string | null;
  mission: {
    id: string;
    slug: string;
    title: string;
    description: string;
    difficulty: MissionDifficulty;
    rewardXp: number;
    rewardTrophies: number;
  };
}

export interface AgencyCoordination {
  stats: {
    activeCount: number;
    completedCount: number;
    totalXp: number;
    activeStreak: number;
  };
  missions: AgencyMission[];
}

export interface AgencyInvite {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  agency: AgencyEntity;
  inviter: { id: string; username?: string | null };
}

export interface AgencyMatchScore {
  homeScore: number;
  awayScore: number;
}

export interface AgencyMatchVoteSummary {
  matchId: string;
  userScore: AgencyMatchScore | null;
  agencyScore: AgencyMatchScore | null;
  totalVotes: number;
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

  getCoordination() {
    return this.http.get<AgencyCoordination>(`${this.baseUrl}/coordination`);
  }

  listAgencies() {
    return this.http.get<Array<AgencyEntity & { _count?: { members: number } }>>(
      this.baseUrl,
    );
  }

  getAgency(id: string) {
    return this.http.get<AgencyRoster>(`${this.baseUrl}/${id}`);
  }

  listCandidates(query: string) {
    return this.http.get<Array<{ id: string; username: string | null; pendingInvite?: boolean }>>(
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

  updateRole(
    memberId: string,
    role: 'DIRECTEUR' | 'ASSOCIE' | 'RESPONSABLE' | 'MEMBRE' | 'STAGIAIRE',
  ) {
    return this.http.patch<{ success: true }>(`${this.baseUrl}/members/${memberId}/role`, {
      role,
    });
  }

  deleteAgency() {
    return this.http.delete<{ success: true }>(this.baseUrl);
  }

  leaveAgency() {
    return this.http.post<{ success: true }>(`${this.baseUrl}/leave`, {});
  }

  createAgency(payload: {
    name: string;
    logoId?: string;
    primaryColor?: string;
    secondaryColor?: string;
  }) {
    return this.http.post<AgencyEntity>(this.baseUrl, payload);
  }

  updateAgency(payload: {
    logoId?: string;
    primaryColor?: string;
    secondaryColor?: string;
    bannerStyle?: 'grid' | 'waves' | 'rain' | 'circuit';
  }) {
    return this.http.patch<AgencyEntity>(`${this.baseUrl}/me`, payload);
  }

  getMatchVotes(params?: { status?: 'UPCOMING' | 'LIVE' | 'FINISHED'; matchIds?: string[] }) {
    const query: Record<string, string> = {};
    if (params?.status) {
      query['status'] = params.status;
    }
    if (params?.matchIds?.length) {
      query['matchIds'] = params.matchIds.join(',');
    }
    return this.http.get<AgencyMatchVoteSummary[]>(`${this.baseUrl}/match-votes`, {
      params: query,
    });
  }

  saveMatchVotes(votes: { matchId: string; homeScore: number; awayScore: number }[]) {
    return this.http.post<AgencyMatchVoteSummary[]>(`${this.baseUrl}/match-votes`, { votes });
  }
}
