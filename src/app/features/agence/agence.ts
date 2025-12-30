import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WalletApiService, WalletEntity } from '../../data-access/wallet/wallet.api';
import { AuthService } from '../../core/services/auth.service';
import { AgenceApiService, AgencyEntity } from '../../data-access/agence/agence.api';

const AGENCY_CREATE_COST = 100;

@Component({
  selector: 'app-agence',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './agence.html',
  styleUrl: './agence.css',
})
export class AgenceComponent implements OnInit {
  private readonly walletApi = inject(WalletApiService);
  private readonly auth = inject(AuthService);
  private readonly agenceApi = inject(AgenceApiService);
  private readonly destroyRef = inject(DestroyRef);

  wallet = signal<WalletEntity | null>(null);
  creating = signal(false);
  modalOpen = signal(false);
  agencyName = signal('');
  selectedLogo = signal('logo-1');
  primaryColor = signal('#22d3ee');
  secondaryColor = signal('#a855f7');
  agency = signal<AgencyEntity | null>(null);
  agencyLoading = signal(false);
  hasAgency = computed(() => !!this.auth.currentUser()?.agencyId || !!this.agency());

  ngOnInit() {
    this.walletApi
      .walletChanges()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((wallet) => {
        this.wallet.set(wallet);
      });
    this.walletApi.getWallet().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.loadAgency();
  }

  private loadAgency() {
    if (!this.hasAgency()) {
      return;
    }
    this.agencyLoading.set(true);
    this.agenceApi
      .getMyAgency()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agency) => {
          this.agency.set(agency);
          this.agencyLoading.set(false);
        },
        error: () => {
          this.agencyLoading.set(false);
        },
      });
  }

  openCreateModal() {
    this.modalOpen.set(true);
    if (!this.agencyName()) {
      const username = this.auth.currentUser()?.username ?? 'agence';
      this.agencyName.set(`${username}-team`);
    }
  }

  closeCreateModal() {
    this.modalOpen.set(false);
  }

  selectLogo(logoId: string) {
    this.selectedLogo.set(logoId);
  }

  updateAgencyName(value: string) {
    this.agencyName.set(value);
  }

  updatePrimaryColor(value: string) {
    this.primaryColor.set(value);
  }

  updateSecondaryColor(value: string) {
    this.secondaryColor.set(value);
  }

  createAgency() {
    if (this.creating() || !this.canCreate()) {
      return;
    }

    const name = this.agencyName().trim();
    if (!name) {
      return;
    }

    this.creating.set(true);
    this.agenceApi
      .createAgency({
        name,
        logoId: this.selectedLogo(),
        primaryColor: this.primaryColor(),
        secondaryColor: this.secondaryColor(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (agency) => {
          this.agency.set(agency);
          this.walletApi.getWallet().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
          this.auth.fetchProfile().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
          this.creating.set(false);
          this.modalOpen.set(false);
        },
        error: () => {
          this.creating.set(false);
        },
      });
  }

  agencyCost() {
    return AGENCY_CREATE_COST;
  }

  canCreate() {
    const isAdmin = this.auth.currentUser()?.role === 'ADMIN';
    return (isAdmin || (this.wallet()?.shards ?? 0) >= AGENCY_CREATE_COST) && !this.hasAgency();
  }

  shardBalance() {
    return this.wallet()?.shards ?? 0;
  }

  availableLogos() {
    return [
      { id: 'logo-1', label: 'Nova' },
      { id: 'logo-2', label: 'Pulse' },
      { id: 'logo-3', label: 'Orbit' },
      { id: 'logo-4', label: 'Echo' },
    ];
  }

  agencyMembers() {
    return this.agency()?._count?.members ?? 0;
  }

  agencyXpTotal() {
    return this.agency()?.xp ?? 0;
  }

  agencyLevel() {
    return this.agency()?.level ?? 1;
  }

  agencyXpCurrent() {
    const level = this.agencyLevel();
    const current = this.agencyXpTotal() - this.agencyXpForLevel(level);
    return Math.max(0, current);
  }

  agencyXpNeeded() {
    const level = this.agencyLevel();
    return Math.max(1, this.agencyXpForLevel(level + 1) - this.agencyXpForLevel(level));
  }

  agencyXpProgressPercent() {
    const needed = this.agencyXpNeeded();
    if (needed <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (this.agencyXpCurrent() / needed) * 100));
  }

  agencyBannerStyle() {
    const agency = this.agency();
    if (!agency) {
      return null;
    }
    return `linear-gradient(120deg, ${agency.primaryColor}, ${agency.secondaryColor})`;
  }

  agencyXpGradient() {
    const agency = this.agency();
    if (!agency) {
      return null;
    }
    return `linear-gradient(90deg, ${agency.primaryColor}, ${agency.secondaryColor})`;
  }

  private agencyXpForLevel(level: number) {
    const base = 600;
    const growth = 320;
    const safeLevel = Math.max(1, Math.floor(level));
    const steps = safeLevel - 1;
    return Math.max(0, Math.floor(steps * base + (steps * (steps - 1) * growth) / 2));
  }
}
