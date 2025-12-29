import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgenceApiService, AgencyEntity } from '../../../data-access/agence/agence.api';

@Component({
  selector: 'app-agence-atelier',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './atelier.component.html',
  styleUrl: './atelier.component.css',
})
export class AgenceAtelierComponent implements OnInit {
  private readonly agenceApi = inject(AgenceApiService);
  private readonly destroyRef = inject(DestroyRef);

  agency = signal<AgencyEntity | null>(null);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  saveSuccess = signal(false);
  primaryColor = signal('#22d3ee');
  secondaryColor = signal('#a855f7');
  selectedLogo = signal('logo-1');
  selectedBanner = signal<BannerStyle>('grid');
  bannerBaseline = signal<BannerStyle>('grid');

  hasAgency = computed(() => !!this.agency());
  hasChanges = computed(() => {
    const agency = this.agency();
    if (!agency) {
      return false;
    }
    return (
      this.selectedLogo() !== agency.logoId ||
      this.primaryColor().toLowerCase() !== agency.primaryColor.toLowerCase() ||
      this.secondaryColor().toLowerCase() !== agency.secondaryColor.toLowerCase() ||
      this.selectedBanner() !== this.bannerBaseline()
    );
  });

  ngOnInit() {
    this.loadAgency();
  }

  private loadAgency() {
    this.loading.set(true);
    this.agenceApi
      .getMyAgency()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agency) => {
          this.agency.set(agency);
          if (agency) {
            this.primaryColor.set(agency.primaryColor);
            this.secondaryColor.set(agency.secondaryColor);
            this.selectedLogo.set(agency.logoId);
            const banner = (agency.bannerStyle as BannerStyle | undefined) ?? 'grid';
            this.selectedBanner.set(banner);
            this.bannerBaseline.set(banner);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  updatePrimaryColor(value: string) {
    this.primaryColor.set(value);
  }

  updateSecondaryColor(value: string) {
    this.secondaryColor.set(value);
  }

  selectLogo(logoId: string) {
    this.selectedLogo.set(logoId);
  }

  applyPreset(primary: string, secondary: string) {
    this.primaryColor.set(primary);
    this.secondaryColor.set(secondary);
  }

  selectBanner(style: BannerStyle) {
    this.selectedBanner.set(style);
  }

  saveChanges() {
    if (this.saving() || !this.hasChanges() || !this.agency()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.saveSuccess.set(false);
    this.agenceApi
      .updateAgency({
        logoId: this.selectedLogo(),
        primaryColor: this.primaryColor(),
        secondaryColor: this.secondaryColor(),
        bannerStyle: this.selectedBanner(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agency) => {
          this.agency.set(agency);
          this.bannerBaseline.set(this.selectedBanner());
          this.saving.set(false);
          this.saveSuccess.set(true);
          setTimeout(() => this.saveSuccess.set(false), 1800);
        },
        error: () => {
          this.error.set("Impossible d'enregistrer les modifications.");
          this.saving.set(false);
        },
      });
  }

  previewBannerStyle() {
    return `linear-gradient(120deg, ${this.primaryColor()}, ${this.secondaryColor()})`;
  }

  agencyName() {
    return this.agency()?.name ?? 'Nom du clan';
  }

  agencyInitials() {
    const name = this.agency()?.name ?? '';
    const letters = name.replace(/[^a-z0-9]/gi, '').slice(0, 2);
    return letters ? letters.toUpperCase() : 'CL';
  }

  agencyMembers() {
    return this.agency()?._count?.members ?? 0;
  }

  agencyTrophies() {
    return this.agency()?.trophiesCount ?? 0;
  }

  agencyRank() {
    return this.agency()?.rank ?? 0;
  }

  availableLogos() {
    return [
      { id: 'logo-1', label: 'Nova' },
      { id: 'logo-2', label: 'Pulse' },
      { id: 'logo-3', label: 'Orbit' },
      { id: 'logo-4', label: 'Echo' },
    ];
  }
}

type BannerStyle = 'grid' | 'waves' | 'rain' | 'circuit';
