import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  UsersApiService,
  AdminUserSummary,
  AdminCreditCurrency,
} from '../../../data-access/users/users.api';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DialogDirective } from '../../../shared/directives/dialog.directive';

@Component({
  selector: 'admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogDirective],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
})
export class UsersComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly target = signal<AdminUserSummary | null>(null);
  reason = '';
  changeStatus() {
    const user = this.target();
    if (!user || this.reason.trim().length < 10 || this.loading()) return;
    this.loading.set(true);
    this.http
      .patch('/api/users/' + user.id + '/status', {
        status: user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
        reason: this.reason,
      })
      .subscribe({
        next: () => {
          this.target.set(null);
          this.reason = '';
          this.loadUsers();
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(e?.error?.message || 'Action impossible.');
        },
      });
  }
  private readonly usersApi = inject(UsersApiService);

  users = signal<AdminUserSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  searchTerm = signal('');
  readonly creditTarget = signal<{ user: AdminUserSummary; currency: AdminCreditCurrency } | null>(
    null,
  );
  readonly creditBusy = signal(false);
  readonly creditUncertain = signal(false);
  readonly creditError = signal('');
  readonly creditResult = signal('');
  creditAmount: number | null = null;
  private creditKey = '';

  filteredUsers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.users();
    }
    return this.users().filter((user) => {
      const username = user.username?.toLowerCase() ?? '';
      const email = user.email.toLowerCase();
      const id = user.id.toLowerCase();
      return username.includes(term) || email.includes(term) || id.includes(term);
    });
  });

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.error.set(null);
    this.usersApi.getAdminUsers(this.searchTerm().trim()).subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les utilisateurs.');
        this.loading.set(false);
      },
    });
  }

  openCredit(user: AdminUserSummary, currency: AdminCreditCurrency) {
    this.creditAmount = null;
    this.creditKey = crypto.randomUUID();
    this.creditError.set('');
    this.creditResult.set('');
    this.creditUncertain.set(false);
    this.creditTarget.set({ user, currency });
  }

  closeCredit() {
    if (!this.creditBusy()) this.creditTarget.set(null);
  }

  validCreditAmount() {
    const amount = this.creditAmount;
    return amount !== null && Number.isInteger(amount) && amount >= 1 && amount <= 1_000_000;
  }

  credit() {
    const target = this.creditTarget();
    const amount = this.creditAmount;
    if (!target || amount === null || !this.validCreditAmount() || this.creditBusy()) return;
    this.creditBusy.set(true);
    this.creditError.set('');
    this.usersApi.creditPlayer(target.user.id, target.currency, amount, this.creditKey).subscribe({
      next: (balance) => {
        this.users.update((users) =>
          users.map((user) => (user.id === target.user.id ? { ...user, ...balance } : user)),
        );
        this.creditBusy.set(false);
        this.creditTarget.set(null);
        const currency = target.currency === 'VERSE' ? 'Verse' : 'Shards';
        this.creditResult.set(
          `${amount.toLocaleString('fr-FR')} ${currency} ajoutés à ${target.user.username || 'ce compte'}.`,
        );
      },
      error: (error) => {
        this.creditBusy.set(false);
        const uncertain = error.status === 0 || error.status >= 500;
        this.creditUncertain.set(uncertain);
        if (!uncertain) this.creditKey = crypto.randomUUID();
        this.creditError.set(
          uncertain
            ? 'Réponse indisponible. Réessaie avec la même quantité ou vérifie le solde avant une nouvelle demande.'
            : error?.error?.message || 'Crédit impossible.',
        );
      },
    });
  }

  trackByUser(_index: number, user: AdminUserSummary) {
    return user.id;
  }
}
