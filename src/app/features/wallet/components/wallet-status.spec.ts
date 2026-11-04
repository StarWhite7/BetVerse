import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { WalletStatusComponent } from './wallet-status';

describe('Daily bonus countdown', () => {
  const serverNow = Date.parse('2026-11-04T12:00:00Z');
  const wallet = {
    id: 'wallet-a',
    userId: 'user-a',
    balance: 500,
    shards: 0,
    createdAt: '',
    updatedAt: '',
    nextClaimAvailableAt: null,
  };
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            sessionVersion: signal(0),
            currentUser: signal({ id: 'user-a' }),
          },
        },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  for (const skew of [-4000, 4000]) {
    it(`counts exactly 24 hours with a device clock offset of ${skew}ms`, () => {
      vi.setSystemTime(serverNow + skew);
      const fixture = TestBed.createComponent(WalletStatusComponent);
      http
        .expectOne('/api/wallet')
        .flush({ ...wallet, serverTime: new Date(serverNow).toISOString() });
      fixture.detectChanges();
      fixture.componentInstance.claim();
      http.expectOne('/api/wallet/claim').flush({
        ...wallet,
        balance: 1000,
        serverTime: new Date(serverNow).toISOString(),
        nextClaimAvailableAt: new Date(serverNow + 86400000).toISOString(),
      });
      fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(button.textContent?.trim()).toBe('24:00:00');
      expect(button.disabled).toBe(true);

      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(button.textContent?.trim()).toBe('23:59:59');

      vi.setSystemTime(serverNow + skew + 86399000);
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain('Bonus : +500 Verse');
      fixture.destroy();
    });
  }
});
