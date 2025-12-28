import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgenceApiService, AgencyEntity, AgencyRoster } from '../../../data-access/agence/agence.api';

@Component({
  selector: 'app-agence-liste',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './liste.component.html',
  styleUrl: './liste.component.css',
})
export class AgenceListeComponent implements OnInit {
  private readonly agenceApi = inject(AgenceApiService);
  private readonly destroyRef = inject(DestroyRef);

  agencies = signal<AgencyEntity[]>([]);
  loading = signal(false);
  selectedAgency = signal<AgencyRoster | null>(null);
  detailLoading = signal(false);

  ngOnInit() {
    this.loadAgencies();
  }

  loadAgencies() {
    this.loading.set(true);
    this.agenceApi
      .listAgencies()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agencies) => {
          this.agencies.set(agencies);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  viewAgency(id: string) {
    this.detailLoading.set(true);
    this.agenceApi
      .getAgency(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agency) => {
          this.selectedAgency.set(agency);
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailLoading.set(false);
        },
      });
  }

  closeAgency() {
    this.selectedAgency.set(null);
  }

  roleLabel(role?: 'DIRECTEUR' | 'ASSOCIE' | 'RESPONSABLE' | 'MEMBRE' | 'STAGIAIRE' | null) {
    const value = role as
      | 'DIRECTEUR'
      | 'ASSOCIE'
      | 'RESPONSABLE'
      | 'MEMBRE'
      | 'STAGIAIRE'
      | null
      | undefined;
    switch (value) {
      case 'DIRECTEUR':
        return 'Directeur';
      case 'ASSOCIE':
        return 'Associe';
      case 'RESPONSABLE':
        return 'Responsable';
      case 'MEMBRE':
        return 'Membre';
      default:
        return 'Stagiaire';
    }
  }
}
