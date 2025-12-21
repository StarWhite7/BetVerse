import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UsersApiService, PublicProfile } from '../../../data-access/users/users.api';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './public-profile.html',
  styleUrl: './public-profile.css',
})
export class PublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly usersApi = inject(UsersApiService);
  private readonly notifications = inject(NotificationService);

  profile = signal<PublicProfile | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  displayName = computed(() => {
    const data = this.profile()?.user;
    return data?.username || 'Joueur';
  });

  constructor() {
    const userId = this.route.snapshot.paramMap.get('id');
    if (!userId) {
      this.loading.set(false);
      this.error.set('Utilisateur introuvable.');
      return;
    }

    this.usersApi.getPublicProfile(userId).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set("Impossible de charger le profil.");
        this.notifications.error("Impossible de charger le profil.");
      },
    });
  }
}
