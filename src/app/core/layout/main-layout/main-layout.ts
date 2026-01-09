import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WalletApiService, WalletEntity } from '../../../data-access/wallet/wallet.api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UsersApiService } from '../../../data-access/users/users.api';
import { NotificationService } from '../../services/notification.service';
import { NotificationsApiService, UserNotification } from '../../../data-access/notifications/notifications.api';
import { AgenceApiService } from '../../../data-access/agence/agence.api';
import { forkJoin, interval } from 'rxjs';
import { TEAM_LOGO_MAP } from '../../../shared/team-logos';
import { officialTeamName } from '../../../shared/team-names';
import { BetsApiService, BetEntity } from '../../../data-access/bets/bets.api';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly walletApi = inject(WalletApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly betsApi = inject(BetsApiService);
  private readonly toastNotifications = inject(NotificationService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly agenceApi = inject(AgenceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly claimCooldownMs = 24 * 60 * 60 * 1000;
  private readonly claimStoragePrefix = 'betverse_next_claim_';

  user = computed(() => this.auth.currentUser());
  wallet = signal<WalletEntity | null>(null);
  walletLoading = signal(false);
  claimLoading = signal(false);
  nextClaimTime = signal<number | null>(null);
  claimCountdown = signal('');
  claimAvailable = computed(() => this.nextClaimTime() === null);
  usernamePromptVisible = signal(false);
  usernamePromptSubmitting = signal(false);
  adminXpLoading = signal(false);
  adminMenuOpen = signal(false);
  notificationsOpen = signal(false);
  notifications = signal<UserNotification[]>([]);
  notificationsLoading = signal(false);
  unreadNotifications = signal(0);
  expandedInviteId = signal<string | null>(null);
  betWinNotifications = signal<UserNotification[]>([]);
  betWinIndex = signal(0);
  betWinVisible = computed(() => this.betWinNotifications().length > 0);
  betWinCurrent = computed(() => this.betWinNotifications()[this.betWinIndex()] ?? null);
  betWinDots = computed(() =>
    Array.from({ length: this.betWinNotifications().length }),
  );
  betWinConfetti = computed(() => Array.from({ length: 8 }));
  betWinMeta = computed(() => this.resolveBetWinMeta(this.betWinCurrent()));
  betWinFallback = signal<BetEntity | null>(null);
  betWinFallbackLoading = signal(false);
  @ViewChild('notificationsWrap') notificationsWrap?: ElementRef<HTMLDivElement>;
  usernamePromptForm = this.fb.nonNullable.group({
    username: [
      '',
      [
       Validators.required,
       Validators.minLength(3),
       Validators.maxLength(24),
       Validators.pattern(/^[a-zA-Z0-9_.-]+$/),
      ],
    ],
  });
  profileInitials = computed(() => {
    const current = this.user();
    if (!current) {
      return 'BV';
    }
    const source = current.username ?? current.email ?? '';
    const letters = source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2);
    return letters ? letters.toUpperCase() : 'BV';
  });
  profileLabel = computed(() => {
    const current = this.user();
    if (!current) {
      return 'Profil';
    }
    return current.username ?? current.email ?? 'Profil';
  });
  xpTotal = computed(() => this.user()?.xp ?? 0);
  xpLevel = computed(() => this.user()?.level ?? 1);
  xpCurrent = computed(() => {
    const level = this.xpLevel();
    const current = this.xpTotal() - this.xpForLevel(level);
    return Math.max(0, current);
  });
  xpNeeded = computed(() => {
    const level = this.xpLevel();
    return Math.max(1, this.xpForLevel(level + 1) - this.xpForLevel(level));
  });
  xpProgressPercent = computed(() => {
    const needed = this.xpNeeded();
    if (needed <= 0) return 0;
    return Math.min(100, Math.max(0, (this.xpCurrent() / needed) * 100));
  });
  hasWalletAccess = computed(() => this.user()?.role === 'ADMIN');
  hasAdminAccess = computed(() => this.user()?.role === 'ADMIN');

  private readonly claimStorageEffect = effect(() => {
    const currentUser = this.user();
    if (!currentUser) {
      this.clearStoredNextClaimTime();
      this.nextClaimTime.set(null);
      this.claimCountdown.set('');
      return;
    }

    const stored = this.getStoredNextClaimTime(currentUser.id);
    if (!stored) {
      this.nextClaimTime.set(null);
      return;
    }

    this.nextClaimTime.set(stored);
  });

  private readonly usernamePromptEffect = effect(() => {
    const current = this.user();
    if (!current) {
      this.usernamePromptVisible.set(false);
      this.usernamePromptForm.reset();
      return;
    }

    if (!current.username) {
      const fallback = this.deriveUsernameFromEmail(current.email);
      this.usernamePromptVisible.set(true);
      this.usernamePromptForm.reset({ username: fallback });
    } else {
      this.usernamePromptVisible.set(false);
    }
  });

  private readonly claimCountdownEffect = effect((onCleanup) => {
    const nextTime = this.nextClaimTime();
    if (!nextTime) {
      this.claimCountdown.set('');
      return;
    }

    const updateCountdown = () => {
      const remaining = nextTime - Date.now();
      if (remaining <= 0) {
        this.nextClaimTime.set(null);
        this.clearStoredNextClaimTime();
        this.claimCountdown.set('');
        return;
      }

      this.claimCountdown.set(this.formatDuration(remaining));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    onCleanup(() => clearInterval(interval));
  });

  private readonly betWinFallbackEffect = effect(() => {
    const current = this.betWinCurrent();
    if (!current || current.type !== 'BET_WON') {
      return;
    }
    const hasMetadata =
      current.metadata &&
      (current.metadata.amount !== undefined ||
        current.metadata.odds !== undefined ||
        current.metadata.payout !== undefined);
    if (hasMetadata || this.betWinFallbackLoading()) {
      return;
    }
    this.loadLastWonBet();
  });

  ngOnInit() {
    this.walletApi
      .walletChanges()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((wallet) => {
        this.wallet.set(wallet);
        this.syncClaimWindowFromWallet(wallet);
      });
    this.loadWallet();
    this.refreshUnreadCount();
    this.refreshNotifications();
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.refreshNotifications();
      });
  }

  logout() {
    this.walletApi.clearCachedWallet();
    this.auth.logout();
  }

  toggleAdminMenu() {
    this.adminMenuOpen.update((open) => !open);
  }

  submitUsernamePrompt() {
    if (this.usernamePromptForm.invalid || this.usernamePromptSubmitting()) {
      this.usernamePromptForm.markAllAsTouched();
      return;
    }

    const username = this.sanitizeUsername(this.usernamePromptForm.controls.username.value);
    this.usernamePromptSubmitting.set(true);
    this.usersApi
      .updateProfile({ username })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.usernamePromptSubmitting.set(false);
          this.auth.syncUser(user);
          this.toastNotifications.success('Pseudo mis a jour.');
        },
        error: () => {
          this.usernamePromptSubmitting.set(false);
          this.toastNotifications.error("Impossible d'enregistrer le pseudo.");
        },
      });
  }

  claimDailyVerses() {
    if (this.claimLoading() || !this.claimAvailable()) {
      return;
    }

    this.claimLoading.set(true);
    this.walletApi
      .claimDailyReward()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (wallet) => {
          const hasServerData = this.syncClaimWindowFromWallet(wallet);
          if (!hasServerData) {
            this.scheduleNextClaim();
          }
          this.auth.fetchProfile().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
          this.claimLoading.set(false);
        },
        error: () => {
          this.claimLoading.set(false);
        },
      });
  }

  addAdminXp() {
    this.adjustAdminXp('add');
  }

  removeAdminXp() {
    this.adjustAdminXp('remove');
  }

  resetAdminXp() {
    this.adjustAdminXp('reset');
  }

  private loadWallet() {
    this.walletLoading.set(true);
    this.walletApi
      .getWallet()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.walletLoading.set(false);
        },
        error: () => {
          this.walletApi.clearCachedWallet();
          this.walletLoading.set(false);
        },
      });
  }

  private adjustAdminXp(action: 'add' | 'remove' | 'reset') {
    if (this.adminXpLoading()) {
      return;
    }

    this.adminXpLoading.set(true);
    const request =
      action === 'add'
        ? this.usersApi.addXp()
        : action === 'remove'
          ? this.usersApi.removeXp()
          : this.usersApi.resetXp();

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user) => {
        this.auth.syncUser(user);
        this.adminXpLoading.set(false);
      },
      error: () => {
        this.toastNotifications.error("Impossible d'ajuster l'XP.");
        this.adminXpLoading.set(false);
      },
    });
  }

  toggleNotifications() {
    this.notificationsOpen.update((open) => !open);
    if (!this.notificationsOpen()) {
      return;
    }
    this.refreshNotifications();
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.notificationsOpen()) {
      return;
    }
    const target = event.target as Node | null;
    const container = this.notificationsWrap?.nativeElement;
    if (container && target && !container.contains(target)) {
      this.closeNotifications();
    }
  }

  @HostListener('window:betverse-bet-win-test', ['$event'])
  onBetWinTest(event: Event) {
    const custom = event as CustomEvent<{
      title?: string;
      message?: string;
      metadata?: UserNotification['metadata'];
    }>;
    const title = custom?.detail?.title?.trim() || 'Pari gagnant';
    const message = custom?.detail?.message?.trim() || 'Votre ticket est gagnant.';
    const metadata = custom?.detail?.metadata;
    this.showBetWinPopup(title, message, metadata ?? undefined);
  }

  refreshNotifications() {
    this.notificationsLoading.set(true);
    this.notificationsApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.notifications.set(items);
        this.syncBetWinNotifications(items);
        this.notificationsLoading.set(false);
        this.refreshUnreadCount();
      },
      error: () => {
        this.notificationsLoading.set(false);
      },
    });
  }

  refreshUnreadCount() {
    this.notificationsApi.unreadCount().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (count) => {
        this.unreadNotifications.set(count);
      },
    });
  }

  markNotificationRead(notificationId: string) {
    this.notificationsApi.markRead(notificationId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.refreshNotifications();
      },
    });
  }

  onNotificationClick(note: UserNotification) {
    if (this.isInviteNotification(note)) {
      this.toggleInviteDetails(note);
      return;
    }
    this.markNotificationRead(note.id);
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

  acceptInviteFromDropdown(note: UserNotification, event: MouseEvent) {
    event.stopPropagation();
    if (!note.inviteId) {
      return;
    }
    this.agenceApi.acceptInvite(note.inviteId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.markNotificationRead(note.id);
      },
    });
  }

  declineInviteFromDropdown(note: UserNotification, event: MouseEvent) {
    event.stopPropagation();
    if (!note.inviteId) {
      return;
    }
    this.agenceApi.declineInvite(note.inviteId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.markNotificationRead(note.id);
      },
    });
  }

  prevBetWin() {
    const total = this.betWinNotifications().length;
    if (total <= 1) {
      return;
    }
    const current = this.betWinIndex();
    this.betWinIndex.set((current - 1 + total) % total);
  }

  nextBetWin() {
    const total = this.betWinNotifications().length;
    if (total <= 1) {
      return;
    }
    const current = this.betWinIndex();
    this.betWinIndex.set((current + 1) % total);
  }

  dismissBetWin() {
    const current = this.betWinCurrent();
    if (!current) {
      return;
    }
    if (current.id.startsWith('local-test-')) {
      this.betWinNotifications.set(
        this.betWinNotifications().filter((note) => note.id !== current.id),
      );
      this.betWinIndex.set(0);
      return;
    }
    this.notificationsApi
      .markRead(current.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refreshNotifications();
        },
      });
  }

  confirmBetWin() {
    this.playCashOutSound();
    this.dismissAllBetWins();
  }

  private syncBetWinNotifications(items: UserNotification[]) {
    const wins = items.filter((note) => note.type === 'BET_WON' && !note.readAt);
    const localTests = this.betWinNotifications().filter((note) =>
      note.id.startsWith('local-test-'),
    );
    this.betWinNotifications.set([...localTests, ...wins]);
    const index = this.betWinIndex();
    const total = localTests.length + wins.length;
    if (total === 0) {
      this.betWinIndex.set(0);
      return;
    }
    if (index >= total) {
      this.betWinIndex.set(0);
    }
  }

  private showBetWinPopup(
    title: string,
    message: string,
    metadata?: UserNotification['metadata'],
  ) {
    const localNotification: UserNotification = {
      id: `local-test-${Date.now()}`,
      type: 'BET_WON',
      title,
      message,
      metadata: metadata ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    this.betWinNotifications.set([localNotification, ...this.betWinNotifications()]);
    this.betWinIndex.set(0);
    this.playBetWinSound();
  }

  private resolveBetWinMeta(note: UserNotification | null) {
    const fallbackMatch = 'Ticket gagnant';
    const fallbackBet = this.betWinFallback();
    if (!note) {
      return {
        matchLabel: fallbackMatch,
        homeTeam: 'Équipe A',
        awayTeam: 'Équipe B',
        betTypeLabel: 'Pari gagnant',
        amount: null,
        odds: null,
        payout: null,
      };
    }

    const metadata = note.metadata ?? {};
    const matchLabel =
      metadata.match ||
      fallbackBet?.match ||
      this.extractMatchFromMessage(note.message) ||
      fallbackMatch;
    const teams = this.parseTeams(matchLabel);
    const homeTeam = this.displayTeamName(teams?.home ?? 'Équipe A');
    const awayTeam = this.displayTeamName(teams?.away ?? 'Équipe B');
    const betTypeLabel = this.formatBetType(
      metadata.betType ?? fallbackBet?.betType,
      homeTeam,
      awayTeam,
    );
    const amount = metadata.amount ?? fallbackBet?.amount ?? null;
    const odds = metadata.odds ?? fallbackBet?.odds ?? null;
    const payout =
      metadata.payout ??
      (amount && odds ? Math.round(amount * odds) : null);

    return {
      matchLabel,
      homeTeam,
      awayTeam,
      betTypeLabel,
      amount,
      odds,
      payout,
    };
  }

  private loadLastWonBet() {
    if (this.betWinFallbackLoading()) {
      return;
    }
    this.betWinFallbackLoading.set(true);
    this.betsApi.getMyBets({ status: 'WON', limit: 1 }).subscribe({
      next: (bets) => {
        this.betWinFallback.set(bets[0] ?? null);
        this.betWinFallbackLoading.set(false);
      },
      error: () => {
        this.betWinFallbackLoading.set(false);
      },
    });
  }

  private extractMatchFromMessage(message: string) {
    const match = /"([^"]+)"/.exec(message ?? '')?.[1];
    return match?.trim() || null;
  }

  private parseTeams(matchLabel: string | null) {
    if (!matchLabel) {
      return null;
    }
    const parts = matchLabel.split(/\s+vs\s+/i);
    if (parts.length < 2) {
      return null;
    }
    return {
      home: parts[0].trim(),
      away: parts[1].trim(),
    };
  }

  private formatBetType(
    betType: string | undefined,
    homeTeam: string,
    awayTeam: string,
  ) {
    const normalized = (betType ?? '').toUpperCase();
    if (normalized === 'HOME') {
      return `Victoire ${homeTeam}`;
    }
    if (normalized === 'AWAY') {
      return `Victoire ${awayTeam}`;
    }
    if (normalized === 'DRAW') {
      return 'Match nul';
    }
    return 'Pari gagnant';
  }

  teamLogoUrl(team: string): string {
    const normalized = this.normalizeTeamName(this.displayTeamName(team));
    const matched = TEAM_LOGO_MAP[normalized];
    if (matched) {
      return matched;
    }
    const initials = this.teamInitials(team);
    const base = 'https://placehold.co/80x80/020617/ffffff?text=';
    return `${base}${encodeURIComponent(initials)}`;
  }

  private teamInitials(team: string): string {
    return team
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || team.charAt(0).toUpperCase();
  }

  private normalizeTeamName(team: string): string {
    return team
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private displayTeamName(team: string): string {
    return officialTeamName(team, (value) => this.normalizeTeamName(value));
  }

  private playBetWinSound() {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.08);
        gain.gain.setValueAtTime(0, now + index * 0.08);
        gain.gain.linearRampToValueAtTime(0.25, now + index * 0.08 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.3);
      });
      setTimeout(() => {
        ctx.close().catch(() => null);
      }, 600);
    } catch {
      // Ignore audio errors silently.
    }
  }

  private playCashOutSound() {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
      setTimeout(() => {
        ctx.close().catch(() => null);
      }, 400);
    } catch {
      // Ignore audio errors silently.
    }
  }

  private dismissAllBetWins() {
    const wins = this.betWinNotifications();
    if (!wins.length) {
      return;
    }

    const serverWins = wins.filter((note) => !note.id.startsWith('local-test-'));
    this.betWinNotifications.set([]);
    this.betWinIndex.set(0);

    if (!serverWins.length) {
      return;
    }

    forkJoin(
      serverWins.map((note) =>
        this.notificationsApi.markRead(note.id).pipe(takeUntilDestroyed(this.destroyRef)),
      ),
    ).subscribe({
      next: () => {
        this.refreshNotifications();
      },
      error: () => {
        this.refreshNotifications();
      },
    });
  }

  private syncClaimWindowFromWallet(wallet: WalletEntity | null): boolean {
    if (!wallet) {
      return false;
    }

    if (wallet.nextClaimAvailableAt === undefined) {
      return false;
    }

    if (wallet.nextClaimAvailableAt === null) {
      this.clearStoredNextClaimTime();
      this.nextClaimTime.set(null);
      return true;
    }

    const timestamp = new Date(wallet.nextClaimAvailableAt).getTime();
    this.setNextClaimTime(timestamp);
    return true;
  }

  private scheduleNextClaim() {
    const target = Date.now() + this.claimCooldownMs;
    this.setNextClaimTime(target);
  }

  private setNextClaimTime(timestamp: number) {
    this.nextClaimTime.set(timestamp);
    this.persistNextClaimTime(timestamp);
  }

  private xpForLevel(level: number) {
    const base = 500;
    const growth = 250;
    const safeLevel = Math.max(1, Math.floor(level));
    const steps = safeLevel - 1;
    return Math.max(0, Math.floor(steps * base + (steps * (steps - 1) * growth) / 2));
  }

  private formatDuration(ms: number) {
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  private getStoredNextClaimTime(userId: string) {
    if (!this.canUseStorage) {
      return null;
    }

    const value = localStorage.getItem(this.storageKey(userId));
    if (!value) {
      return null;
    }

    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) {
      localStorage.removeItem(this.storageKey(userId));
      return null;
    }

    if (timestamp <= Date.now()) {
      localStorage.removeItem(this.storageKey(userId));
      return null;
    }

    return timestamp;
  }

  private persistNextClaimTime(timestamp: number) {
    const currentUser = this.user();
    if (!currentUser || !this.canUseStorage) {
      return;
    }

    localStorage.setItem(this.storageKey(currentUser.id), String(timestamp));
  }

  private clearStoredNextClaimTime() {
    const currentUser = this.user();
    if (!currentUser || !this.canUseStorage) {
      return;
    }

    localStorage.removeItem(this.storageKey(currentUser.id));
  }

  private get canUseStorage() {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private storageKey(userId: string) {
    return `${this.claimStoragePrefix}${userId}`;
  }

  private deriveUsernameFromEmail(email: string) {
    return (email?.split('@')[0] ?? 'betverse').toLowerCase();
  }

  private sanitizeUsername(value: string) {
    return value.trim().toLowerCase();
  }
}
