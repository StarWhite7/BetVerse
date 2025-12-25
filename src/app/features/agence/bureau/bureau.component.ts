import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgenceApiService, AgencyMember, AgencyRoster } from '../../../data-access/agence/agence.api';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-agence-bureau',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './bureau.component.html',
  styleUrl: './bureau.component.css',
})
export class AgenceBureauComponent implements OnInit {
  private readonly agenceApi = inject(AgenceApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  roster = signal<AgencyRoster | null>(null);
  loading = signal(false);
  inviteOpen = signal(false);
  query = signal('');
  candidates = signal<Array<{ id: string; username: string | null }>>([]);
  inviting = signal(false);
  deleteOpen = signal(false);
  deleteInput = signal('');
  deleteError = signal(false);
  deleting = signal(false);
  capacity = 10;

  ngOnInit() {
    this.loadRoster();
  }

  loadRoster() {
    this.loading.set(true);
    this.agenceApi.getRoster().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (roster) => {
        this.roster.set(roster);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  openInvite() {
    this.inviteOpen.set(true);
    this.refreshCandidates();
  }

  closeInvite() {
    this.inviteOpen.set(false);
  }

  openDelete() {
    this.deleteInput.set('');
    this.deleteError.set(false);
    this.deleteOpen.set(true);
  }

  closeDelete() {
    this.deleteOpen.set(false);
    this.deleteInput.set('');
    this.deleteError.set(false);
  }

  updateDeleteInput(value: string) {
    this.deleteInput.set(value);
  }

  confirmDelete() {
    if (this.deleting()) {
      return;
    }

    if (this.deleteInput().trim() !== 'DELETE') {
      this.flashDeleteWarning();
      return;
    }

    this.deleting.set(true);
    this.agenceApi
      .deleteAgency()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.closeDelete();
          this.roster.set(null);
          this.auth
            .fetchProfile()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => this.router.navigate(['/agence']),
              error: () => this.router.navigate(['/agence']),
            });
        },
        error: () => {
          this.deleting.set(false);
        },
      });
  }

  private flashDeleteWarning() {
    this.deleteError.set(false);
    setTimeout(() => this.deleteError.set(true), 0);
    setTimeout(() => this.deleteError.set(false), 800);
  }

  updateQuery(value: string) {
    this.query.set(value);
    this.refreshCandidates();
  }

  refreshCandidates() {
    this.agenceApi
      .listCandidates(this.query())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => {
          this.candidates.set(users);
        },
      });
  }

  invite(username: string | null) {
    if (!username || this.inviting()) {
      return;
    }
    this.inviting.set(true);
    this.agenceApi.invite(username).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.inviting.set(false);
        this.refreshCandidates();
      },
      error: () => {
        this.inviting.set(false);
      },
    });
  }

  members(): AgencyMember[] {
    return this.roster()?.members ?? [];
  }

  membersCount() {
    return this.roster()?._count?.members ?? 0;
  }

  onlineCount() {
    return Math.min(5, this.membersCount());
  }

  averageXp() {
    const members = this.members();
    if (!members.length) {
      return 0;
    }
    const total = members.reduce((sum, member) => sum + (member.xp ?? 0), 0);
    return Math.round(total / members.length);
  }

  roleLabel(role: AgencyMember['agencyRole']) {
    switch (role) {
      case 'DIRECTEUR':
        return 'Directeur';
      case 'ASSOCIE':
        return 'Associe';
      case 'RESPONSABLE':
        return 'Responsable';
      default:
        return 'Stagiaire';
    }
  }
}
