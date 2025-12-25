import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationsApiService, UserNotification } from '../../data-access/notifications/notifications.api';
import { AgenceApiService, AgencyInvite } from '../../data-access/agence/agence.api';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css',
})
export class NotificationsComponent implements OnInit {
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly agenceApi = inject(AgenceApiService);
  private readonly destroyRef = inject(DestroyRef);

  notifications = signal<UserNotification[]>([]);
  invites = signal<AgencyInvite[]>([]);
  loading = signal(false);

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.notificationsApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.notifications.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
    this.agenceApi.listInvites().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (invites) => {
        this.invites.set(invites);
      },
    });
  }

  markRead(notificationId: string) {
    this.notificationsApi.markRead(notificationId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.loadAll();
      },
    });
  }

  acceptInvite(inviteId: string) {
    this.agenceApi.acceptInvite(inviteId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.loadAll();
      },
    });
  }

  declineInvite(inviteId: string) {
    this.agenceApi.declineInvite(inviteId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.loadAll();
      },
    });
  }
}
