import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
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
  showRoster = signal(true);
  loading = signal(false);
  inviteOpen = signal(false);
  rolesOpen = signal(false);
  query = signal('');
  candidates = signal<Array<{ id: string; username: string | null; pendingInvite?: boolean }>>([]);
  inviting = signal(false);
  pendingInvites = signal(new Set<string>());
  draggingMemberId = signal<string | null>(null);
  dragOverRole = signal<RoleKey | null>(null);
  roleError = signal<string | null>(null);
  pendingRoles = signal<Record<string, RoleKey>>({});
  savingRoles = signal(false);
  deleteOpen = signal(false);
  deleteInput = signal('');
  deleteError = signal(false);
  deleting = signal(false);
  leaveOpen = signal(false);
  leaving = signal(false);
  capacity = 10;
  private readonly roleOptionsList: RoleOption[] = [
    { key: 'DIRECTEUR', label: 'Directeur', hint: '1 seul', layoutClass: 'role-card--directeur' },
    { key: 'RESPONSABLE', label: 'Responsable', layoutClass: 'role-card--responsable' },
    { key: 'ASSOCIE', label: 'Associe', layoutClass: 'role-card--associe' },
    { key: 'MEMBRE', label: 'Membre', layoutClass: 'role-card--membre' },
    { key: 'STAGIAIRE', label: 'Stagiaire', layoutClass: 'role-card--stagiaire' },
  ];
  private readonly excludedUsernames = new Set(['pierretest', 'test']);

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

  openRoles() {
    this.roleError.set(null);
    this.pendingRoles.set({});
    this.savingRoles.set(false);
    this.rolesOpen.set(true);
  }

  closeRoles() {
    this.rolesOpen.set(false);
    this.draggingMemberId.set(null);
    this.dragOverRole.set(null);
    this.pendingRoles.set({});
    this.savingRoles.set(false);
    this.roleError.set(null);
  }

  resetRoles() {
    this.pendingRoles.set({});
    this.roleError.set(null);
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

  openLeave() {
    this.leaveOpen.set(true);
  }

  closeLeave() {
    this.leaveOpen.set(false);
  }

  confirmLeave() {
    if (this.leaving()) {
      return;
    }
    this.leaving.set(true);
    this.agenceApi
      .leaveAgency()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.leaving.set(false);
          this.closeLeave();
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
          this.leaving.set(false);
        },
      });
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

  isPending(username: string | null, pendingInvite?: boolean) {
    if (pendingInvite) {
      return true;
    }
    const key = this.pendingKey(username);
    if (!key) {
      return false;
    }
    return this.pendingInvites().has(key);
  }

  invite(username: string | null) {
    if (!username || this.inviting() || this.isPending(username)) {
      return;
    }
    this.inviting.set(true);
    this.addPending(username);
    this.agenceApi.invite(username).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.inviting.set(false);
        this.refreshCandidates();
      },
      error: () => {
        this.inviting.set(false);
        this.removePending(username);
      },
    });
  }

  members(): AgencyMember[] {
    const members = this.roster()?.members ?? [];
    return [...members].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
  }

  rankedMembers() {
    return this.membersByPrediction().map((member, index) => ({
      ...member,
      rank: index + 1,
    }));
  }

  membersByPrediction(): AgencyMember[] {
    const members = this.roster()?.members ?? [];
    return members
      .filter((member) => !this.isExcludedMember(member))
      .slice()
      .sort((a, b) => {
      const diff = (b.predictionScore ?? 0) - (a.predictionScore ?? 0);
      if (diff !== 0) {
        return diff;
      }
      return (b.xp ?? 0) - (a.xp ?? 0);
    });
  }

  toggleRosterView() {
    this.showRoster.update((current) => !current);
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
      case 'MEMBRE':
        return 'Membre';
      default:
        return 'Stagiaire';
    }
  }

  roleClass(role: AgencyMember['agencyRole']) {
    switch (role) {
      case 'DIRECTEUR':
        return 'role--directeur';
      case 'ASSOCIE':
        return 'role--associe';
      case 'RESPONSABLE':
        return 'role--responsable';
      case 'MEMBRE':
        return 'role--membre';
      default:
        return 'role--stagiaire';
    }
  }

  isDirector() {
    const currentId = this.auth.currentUser()?.id;
    if (!currentId) {
      return false;
    }
    return (this.roster()?.members ?? []).some(
      (member) => member.id === currentId && member.agencyRole === 'DIRECTEUR',
    );
  }

  canManageAgency() {
    const currentId = this.auth.currentUser()?.id;
    if (!currentId) {
      return false;
    }
    return (this.roster()?.members ?? []).some((member) => {
      if (member.id !== currentId) {
        return false;
      }
      return (
        member.agencyRole !== 'STAGIAIRE' &&
        member.agencyRole !== 'MEMBRE' &&
        member.agencyRole !== null
      );
    });
  }

  canLeave() {
    return !!this.auth.currentUser()?.agencyId && !this.isDirector();
  }

  roleOptions() {
    return this.roleOptionsList;
  }

  membersByRole(role: RoleKey) {
    const members = this.roster()?.members ?? [];
    return members.filter((member) => this.getRoleFor(member) === role);
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDragStart(event: DragEvent, member: AgencyMember) {
    event.dataTransfer?.setData('application/agency-member', member.id);
    event.dataTransfer?.setData('text/plain', member.id);
    event.dataTransfer?.setDragImage?.(event.target as Element, 10, 10);
    this.draggingMemberId.set(member.id);
  }

  onDragEnd() {
    this.draggingMemberId.set(null);
    this.dragOverRole.set(null);
  }

  onDragEnter(role: RoleKey) {
    this.dragOverRole.set(role);
  }

  onDragLeave(role: RoleKey) {
    if (this.dragOverRole() === role) {
      this.dragOverRole.set(null);
    }
  }

  onDrop(event: DragEvent, role: RoleKey) {
    event.preventDefault();
    const memberId =
      event.dataTransfer?.getData('application/agency-member') ||
      event.dataTransfer?.getData('text/plain') ||
      this.draggingMemberId();
    this.dragOverRole.set(null);
    this.draggingMemberId.set(null);
    if (!memberId) {
      return;
    }
    this.assignRole(memberId, role);
  }

  private addPending(username: string | null) {
    const key = this.pendingKey(username);
    if (!key) {
      return;
    }
    const next = new Set(this.pendingInvites());
    next.add(key);
    this.pendingInvites.set(next);
  }

  private removePending(username: string | null) {
    const key = this.pendingKey(username);
    if (!key) {
      return;
    }
    const next = new Set(this.pendingInvites());
    next.delete(key);
    this.pendingInvites.set(next);
  }

  private pendingKey(username: string | null) {
    return username?.trim().toLowerCase() ?? '';
  }

  private isExcludedMember(member: AgencyMember) {
    const username = member.username?.trim().toLowerCase();
    return username ? this.excludedUsernames.has(username) : false;
  }

  private assignRole(memberId: string, role: RoleKey) {
    const roster = this.roster();
    const members = roster?.members ?? [];
    const member = members.find((item) => item.id === memberId);
    if (!member) {
      return;
    }

    const currentRole = this.getRoleFor(member);
    if (currentRole === role) {
      return;
    }

    if (!this.canManageDirector() && (currentRole === 'DIRECTEUR' || role === 'DIRECTEUR')) {
      this.roleError.set('Seul le directeur peut changer le role de directeur.');
      return;
    }

    if (role === 'DIRECTEUR') {
      const currentDirector = members.find((item) => this.getRoleFor(item) === 'DIRECTEUR');
      if (currentDirector && currentDirector.id !== memberId) {
        this.setPendingRole(currentDirector.id, 'ASSOCIE');
      }
    }

    this.roleError.set(null);
    this.setPendingRole(memberId, role);
  }

  validateRoles() {
    if (this.savingRoles()) {
      return;
    }

    if (!this.hasDirectorAfterChanges()) {
      this.roleError.set('Il faut obligatoire un leader');
      return;
    }

    const changes = this.pendingRoleChanges();
    if (!changes.length) {
      this.closeRoles();
      return;
    }

    this.savingRoles.set(true);
    forkJoin(changes.map((change) => this.agenceApi.updateRole(change.id, change.role)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.applyPendingRoles();
          this.savingRoles.set(false);
          this.closeRoles();
        },
        error: () => {
          this.savingRoles.set(false);
          this.roleError.set('Impossible de mettre a jour les roles.');
        },
      });
  }

  private applyPendingRoles() {
    const roster = this.roster();
    if (!roster?.members) {
      return;
    }
    const pending = this.pendingRoles();
    if (!Object.keys(pending).length) {
      return;
    }
    const members = roster.members.map((member) => {
      const role = pending[member.id];
      return role ? { ...member, agencyRole: role } : member;
    });
    this.roster.set({ ...roster, members });
    this.pendingRoles.set({});
  }

  private pendingRoleChanges() {
    const members = this.roster()?.members ?? [];
    const pending = this.pendingRoles();
    return members
      .filter((member) => pending[member.id] && pending[member.id] !== this.baseRole(member))
      .map((member) => ({ id: member.id, role: pending[member.id] }));
  }

  private getRoleFor(member: AgencyMember): RoleKey {
    const pending = this.pendingRoles();
    return pending[member.id] ?? this.baseRole(member);
  }

  private baseRole(member: AgencyMember): RoleKey {
    return (member.agencyRole ?? 'STAGIAIRE') as RoleKey;
  }

  private setPendingRole(memberId: string, role: RoleKey) {
    const roster = this.roster();
    if (!roster?.members) {
      return;
    }
    const member = roster.members.find((item) => item.id === memberId);
    if (!member) {
      return;
    }
    const baseRole = this.baseRole(member);
    const next = { ...this.pendingRoles() };
    if (role === baseRole) {
      delete next[memberId];
    } else {
      next[memberId] = role;
    }
    this.pendingRoles.set(next);
  }

  private hasDirectorAfterChanges() {
    const members = this.roster()?.members ?? [];
    if (!members.length) {
      return false;
    }
    return members.some((member) => this.getRoleFor(member) === 'DIRECTEUR');
  }

  private canManageDirector() {
    return this.isAdmin() || this.isDirector();
  }

  private isAdmin() {
    return this.auth.currentUser()?.role === 'ADMIN';
  }
}

type RoleKey = 'DIRECTEUR' | 'ASSOCIE' | 'RESPONSABLE' | 'MEMBRE' | 'STAGIAIRE';

type RoleOption = {
  key: RoleKey;
  label: string;
  hint?: string;
  layoutClass: string;
};
