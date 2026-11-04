import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, filter, finalize, forkJoin, merge, switchMap, timer } from 'rxjs';
import {
  NotificationsApiService,
  UserNotification,
} from '../../../data-access/notifications/notifications.api';
import { AgenceApiService } from '../../../data-access/agence/agence.api';
import { WalletApiService } from '../../../data-access/wallet/wallet.api';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { displayTeamName, teamLogoUrl } from '../../../shared/utils/team-presentation';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, RouterLink, DialogDirective],
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.css',
})
export class NotificationCenterComponent {
  private readonly api = inject(NotificationsApiService);
  private readonly agencies = inject(AgenceApiService);
  private readonly wallet = inject(WalletApiService);
  private readonly auth = inject(AuthService);
  private readonly notices = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly seen = new Set<string>();
  notificationsOpen = signal(false);
  notifications = signal<UserNotification[]>([]);
  notificationsLoading = signal(false);
  unreadNotifications = signal(0);
  expandedInviteId = signal<string | null>(null);
  betWinNotifications = computed(() =>
    this.notifications().filter((note) => note.type === 'BET_WON' && !note.readAt),
  );
  betWinIndex = signal(0);
  betWinVisible = computed(() => this.betWinNotifications().length > 0);
  betWinCurrent = computed(
    () =>
      this.betWinNotifications()[
        Math.min(this.betWinIndex(), this.betWinNotifications().length - 1)
      ],
  );
  betWinDots = computed(() => this.betWinNotifications());
  betWinConfetti = () => Array.from({ length: 8 });
  teamLogoUrl = teamLogoUrl;
  betWinMeta = computed(() => {
    const metadata = this.betWinCurrent()?.metadata;
    const teams = (metadata?.match ?? '').split(/\s+vs\s+/i);
    const homeTeam = displayTeamName(teams[0] || 'Équipe A');
    const awayTeam = displayTeamName(teams[1] || 'Équipe B');
    return {
      homeTeam,
      awayTeam,
      betTypeLabel:
        metadata?.betType === 'DRAW'
          ? 'Match nul'
          : metadata?.betType === 'HOME'
            ? homeTeam
            : awayTeam,
      amount: metadata?.amount,
      odds: metadata?.odds,
      payout: metadata?.payout,
    };
  });
  @ViewChild('notificationsWrap') notificationsWrap?: ElementRef<HTMLElement>;
  constructor() {
    merge(timer(0, 30_000).pipe(filter(() => !document.hidden)), this.api.changes)
      .pipe(
        switchMap(() => {
          this.notificationsLoading.set(true);
          return forkJoin({ items: this.api.list(), count: this.api.unreadCount() }).pipe(
            catchError(() => EMPTY),
            finalize(() => this.notificationsLoading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ items, count }) => {
        this.notifications.set(items);
        this.unreadNotifications.set(count);
        this.betWinIndex.set(
          Math.max(0, Math.min(this.betWinIndex(), this.betWinNotifications().length - 1)),
        );
        const unseen = items.filter(
          (note) =>
            (note.type === 'BET_WON' || note.type === 'BET_REFUNDED') && !this.seen.has(note.id),
        );
        for (const note of items) this.seen.add(note.id);
        if (unseen.length)
          forkJoin([this.wallet.getWallet(), this.auth.fetchProfile()])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => {} });
      });
  }
  toggleNotifications() {
    this.notificationsOpen.update((open) => !open);
    if (this.notificationsOpen()) this.refreshNotifications();
  }
  closeNotifications() {
    this.notificationsOpen.set(false);
  }
  refreshNotifications() {
    this.api.changes.next();
  }
  @HostListener('document:click', ['$event']) outside(event: MouseEvent) {
    if (!this.notificationsWrap?.nativeElement.contains(event.target as Node))
      this.closeNotifications();
  }
  isInviteNotification(note: UserNotification) {
    return note.type === 'AGENCY_INVITE' && !!note.inviteId;
  }
  isInviteResolved(note: UserNotification) {
    return note.type === 'AGENCY_INVITE_ACCEPTED' || note.type === 'AGENCY_INVITE_DECLINED';
  }
  isInviteExpanded(note: UserNotification) {
    return this.expandedInviteId() === note.id;
  }
  onNotificationClick(note: UserNotification) {
    if (this.isInviteNotification(note))
      this.expandedInviteId.set(this.isInviteExpanded(note) ? null : note.id);
    else
      this.api
        .markRead(note.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ error: () => this.notices.error('Impossible de marquer la notification.') });
  }
  acceptInviteFromDropdown(note: UserNotification, event: MouseEvent) {
    this.respondInvite(note, event, true);
  }
  declineInviteFromDropdown(note: UserNotification, event: MouseEvent) {
    this.respondInvite(note, event, false);
  }
  private respondInvite(note: UserNotification, event: MouseEvent, accept: boolean) {
    event.stopPropagation();
    if (!note.inviteId) return;
    (accept
      ? this.agencies.acceptInvite(note.inviteId)
      : this.agencies.declineInvite(note.inviteId)
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refreshNotifications();
          this.auth
            .fetchProfile()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => {} });
        },
        error: (error) => this.notices.error(error?.error?.message ?? 'Invitation indisponible.'),
      });
  }
  prevBetWin() {
    this.betWinIndex.update((index) => Math.max(0, index - 1));
  }
  nextBetWin() {
    this.betWinIndex.update((index) => Math.min(this.betWinNotifications().length - 1, index + 1));
  }
  confirmBetWin() {
    const wins = this.betWinNotifications();
    if (!wins.length) return;
    forkJoin(wins.map((note) => this.api.markRead(note.id)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.refreshNotifications(),
        error: () => this.notices.error('Impossible de confirmer les notifications.'),
      });
  }
}
