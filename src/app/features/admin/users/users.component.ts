import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { UsersApiService, AdminUserSummary } from '../../../data-access/users/users.api';

@Component({
  selector: 'admin-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
})
export class UsersComponent implements OnInit {
  private readonly usersApi = inject(UsersApiService);

  users = signal<AdminUserSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  searchTerm = signal('');

  filteredUsers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.users();
    }
    return this.users().filter((user) => {
      const username = user.username?.toLowerCase() ?? '';
      const email = user.email.toLowerCase();
      const id = user.id.toLowerCase();
      return (
        username.includes(term) ||
        email.includes(term) ||
        id.includes(term)
      );
    });
  });

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.error.set(null);
    this.usersApi.getAdminUsers().subscribe({
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

  trackByUser(_index: number, user: AdminUserSummary) {
    return user.id;
  }
}
