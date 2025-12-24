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

@Injectable({ providedIn: 'root' })
export class AgenceApiService {
  private readonly baseUrl = `${environment.apiUrl}/agence`;

  constructor(private readonly http: HttpClient) {}

  getMyAgency() {
    return this.http.get<AgencyEntity | null>(`${this.baseUrl}/me`);
  }

  listAgencies() {
    return this.http.get<Array<AgencyEntity & { _count?: { members: number } }>>(
      this.baseUrl,
    );
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
