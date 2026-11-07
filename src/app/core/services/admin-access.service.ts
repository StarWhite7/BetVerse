import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../config/environment';

const storageKey = 'betverse_admin_tab_proof';

export interface AdminSecurityStatus {
  configured: boolean;
  required: boolean;
  enrolled: boolean;
  verified: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminAccessService {
  private readonly http = inject(HttpClient);
  private readonly currentStatus = signal<AdminSecurityStatus | null>(null);
  readonly status = this.currentStatus.asReadonly();
  private proof: string | null = null;
  private generation = 0;

  constructor() {
    try {
      this.proof = sessionStorage.getItem(storageKey);
    } catch {
      // The in-memory proof still works if the browser blocks session storage.
    }
  }

  getProof() {
    return this.proof;
  }

  read() {
    const generation = this.generation;
    return this.http.get<AdminSecurityStatus>(`${environment.apiUrl}/admin/security`).pipe(
      tap((status) => {
        if (generation === this.generation) this.currentStatus.set(status);
      }),
    );
  }

  verify(code: string, setup = false) {
    const generation = this.generation;
    return this.http
      .post<{ verified: true; tabProof: string; recoveryCodes?: string[] }>(
        `${environment.apiUrl}/admin/security/verify`,
        { code, setup },
      )
      .pipe(
        tap(({ tabProof }) => {
          if (generation !== this.generation) return;
          if (!/^[a-f0-9]{64}$/.test(tabProof))
            throw new Error('Validation administrateur incomplète.');
          this.saveProof(tabProof);
          this.currentStatus.update((value) =>
            value ? { ...value, enrolled: true, verified: true } : null,
          );
        }),
      );
  }

  reject(proof: string | null) {
    if (proof !== this.proof) return;
    this.saveProof(null);
    this.currentStatus.update((value) => (value ? { ...value, verified: false } : null));
  }

  clear() {
    this.generation++;
    this.saveProof(null);
    this.currentStatus.set(null);
  }

  private saveProof(proof: string | null) {
    this.proof = proof;
    try {
      if (proof) sessionStorage.setItem(storageKey, proof);
      else sessionStorage.removeItem(storageKey);
    } catch {
      // Keep the in-memory value for the current page.
    }
  }
}
