import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WalletStatusComponent } from '../../../features/wallet/components/wallet-status';
import { NotificationCenterComponent } from '../../../features/notifications/components/notification-center';
import { xpForLevel } from '../../../shared/utils/progression';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    WalletStatusComponent,
    NotificationCenterComponent,
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout {
  private readonly auth = inject(AuthService);
  user = computed(() => this.auth.currentUser());
  adminMenuOpen = signal(false);
  hasAdminAccess = computed(() => this.user()?.role === 'ADMIN');
  profileLabel = computed(() => this.user()?.username ?? 'Profil');
  profileInitials = computed(() => this.profileLabel().slice(0, 2).toUpperCase());
  xpCurrent = computed(() =>
    Math.max(0, (this.user()?.xp ?? 0) - xpForLevel(this.user()?.level ?? 1)),
  );
  xpNeeded = computed(
    () => xpForLevel((this.user()?.level ?? 1) + 1) - xpForLevel(this.user()?.level ?? 1),
  );
  xpProgressPercent = computed(() => Math.min(100, (this.xpCurrent() / this.xpNeeded()) * 100));
  toggleAdminMenu() {
    this.adminMenuOpen.update((open) => !open);
  }
  logout() {
    this.auth.logout();
  }
}
