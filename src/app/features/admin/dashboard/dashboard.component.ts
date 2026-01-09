import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { UsersApiService } from '../../../data-access/users/users.api';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  resetting = signal(false);
  resetModalOpen = signal(false);

  constructor(
    private readonly usersApi: UsersApiService,
    private readonly notifications: NotificationService,
  ) {}

  resetEconomy() {
    if (!this.resetting()) {
      this.resetModalOpen.set(true);
    }
  }

  cancelReset() {
    if (!this.resetting()) {
      this.resetModalOpen.set(false);
    }
  }

  confirmReset() {
    if (this.resetting()) {
      return;
    }

    this.resetting.set(true);
    this.usersApi.resetEconomy().subscribe({
      next: () => {
        this.resetting.set(false);
        this.resetModalOpen.set(false);
        this.notifications.success('Remise à zéro effectuée.');
      },
      error: () => {
        this.resetting.set(false);
        this.notifications.error('Impossible de remettre à zéro.');
      },
    });
  }
}
