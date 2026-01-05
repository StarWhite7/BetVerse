import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgenceApiService, AgencyEntity } from '../../data-access/agence/agence.api';

@Component({
  selector: 'app-classement-des-agences',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './classementdesagences.component.html',
  styleUrl: './classementdesagences.component.css',
})
export class ClassementDesAgencesComponent implements OnInit {
  private readonly agenceApi = inject(AgenceApiService);
  private readonly destroyRef = inject(DestroyRef);

  agencies = signal<AgencyEntity[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  selectedPeriod = signal<'weekly' | 'monthly' | 'annual'>('weekly');
  selectedOffset = signal(0);
  readonly periodOptions = [
    { key: 'weekly', label: 'Hebdo' },
    { key: 'monthly', label: 'Mensuel' },
    { key: 'annual', label: 'Annuel' },
  ] as const;
  readonly offsetOptions = [
    { value: 0, label: 'Actuel' },
    { value: -1, label: 'Precedent' },
  ] as const;

  ngOnInit() {
    this.loadAgencies();
  }

  loadAgencies() {
    this.loading.set(true);
    this.error.set(null);
    this.agenceApi
      .listAgencies(this.selectedPeriod(), this.selectedOffset())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agencies) => {
          this.agencies.set(agencies);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Impossible de charger le classement.');
          this.loading.set(false);
        },
      });
  }

  setPeriod(period: 'weekly' | 'monthly' | 'annual') {
    if (this.selectedPeriod() === period) {
      return;
    }
    this.selectedPeriod.set(period);
    this.loadAgencies();
  }

  setOffset(offset: number) {
    if (this.selectedOffset() === offset) {
      return;
    }
    this.selectedOffset.set(offset);
    this.loadAgencies();
  }
}
