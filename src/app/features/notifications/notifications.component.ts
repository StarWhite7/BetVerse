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
  expandedInviteId = signal<string | null>(null);
  deletingRead = signal(false);

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

  onNotificationClick(note: UserNotification) {
    if (this.isInviteNotification(note)) {
      this.toggleInviteDetails(note);
      return;
    }
    this.markRead(note.id);
  }

  isInviteNotification(note: UserNotification) {
    return note.type === 'AGENCY_INVITE' && !!note.inviteId;
  }

  isInviteResolved(note: UserNotification) {
    return (
      note.type === 'AGENCY_INVITE_ACCEPTED' || note.type === 'AGENCY_INVITE_DECLINED'
    );
  }

  isInviteExpanded(note: UserNotification) {
    return this.expandedInviteId() === note.id;
  }

  toggleInviteDetails(note: UserNotification) {
    if (!this.isInviteNotification(note)) {
      return;
    }
    this.expandedInviteId.set(this.isInviteExpanded(note) ? null : note.id);
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

  deleteReadNotifications() {
    if (this.deletingRead()) {
      return;
    }
    this.deletingRead.set(true);
    this.notificationsApi.deleteRead().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.deletingRead.set(false);
        this.loadAll();
      },
      error: () => {
        this.deletingRead.set(false);
      },
    });
  }
}
