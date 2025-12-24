import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../core/config/environment';

export interface AgencyEntity {
  id: string;
  name: string;
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

  createAgency(name: string) {
    return this.http.post<AgencyEntity>(this.baseUrl, { name });
  }
}
