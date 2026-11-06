import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { UsersApiService, AdminUserSummary } from '../../../data-access/users/users.api';
import {FormsModule} from '@angular/forms';
import {HttpClient} from '@angular/common/http';
import {DialogDirective} from '../../../shared/directives/dialog.directive';

@Component({
  selector: 'admin-users',
  standalone: true,
  imports: [CommonModule,FormsModule,DialogDirective],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
})
export class UsersComponent implements OnInit {
  private readonly http=inject(HttpClient);readonly target=signal<AdminUserSummary|null>(null);reason='';
  changeStatus(){const user=this.target();if(!user||this.reason.trim().length<10||this.loading())return;this.loading.set(true);
    this.http.patch('/api/users/'+user.id+'/status',{status:user.status==='SUSPENDED'?'ACTIVE':'SUSPENDED',reason:this.reason}).subscribe({next:()=>{this.target.set(null);this.reason='';this.loadUsers();},error:e=>{this.loading.set(false);this.error.set(e?.error?.message||'Action impossible.');}});}
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

  trackByUser(_index: number, user: AdminUserSummary) {
    return user.id;
  }
}
