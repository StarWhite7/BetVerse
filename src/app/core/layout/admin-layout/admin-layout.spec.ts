import { Component, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BetsComponent } from '../../../features/admin/bets/bets.component';
import { authInterceptor } from '../../interceptors/auth.interceptor';
import { AuthService } from '../../services/auth.service';
import { AdminLayout } from './admin-layout';

@Component({ template: '<p>Autre écran admin</p>' })
class AnotherAdminPage {}

describe('Admin panel verification', () => {
  it('opens the challenge before loading bets and keeps the grant across admin navigation until logout', async () => {
    const key = 'betverse_admin_tab_proof';
    sessionStorage.removeItem(key);
    const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    });
    try {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(withInterceptors([authInterceptor])),
          provideHttpClientTesting(),
          provideRouter([
            {
              path: 'admin',
              component: AdminLayout,
              children: [
                { path: 'bets', component: BetsComponent },
                { path: 'matches', component: AnotherAdminPage },
              ],
            },
          ]),
        ],
      });
      const http = TestBed.inject(HttpTestingController);
      const harness = await RouterTestingHarness.create('/admin/bets');
      const status = http.expectOne('/api/admin/security');
      expect(status.request.headers.has('X-Admin-Tab')).toBe(false);
      http.expectNone((request) => request.url === '/api/bet/admin-bets');
      status.flush({ configured: true, required: false, enrolled: true, verified: false });
      harness.detectChanges();
      await harness.fixture.whenStable();
      const dialog = harness.routeNativeElement!.querySelector('dialog')!;
      expect(dialog.getAttribute('aria-labelledby')).toBe('admin-verification-title');
      http.expectNone((request) => request.url === '/api/bet/admin-bets');
      const input = dialog.querySelector('input')!;
      input.value = '123456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      dialog
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const verify = http.expectOne('/api/admin/security/verify');
      expect(verify.request.body).toEqual({ code: '123456', setup: false });
      const proof = 'a'.repeat(64);
      verify.flush({ verified: true, tabProof: proof });
      harness.detectChanges();
      const bets = () => http.expectOne((request) => request.url === '/api/bet/admin-bets');
      const firstRead = bets();
      expect(firstRead.request.headers.get('X-Admin-Tab')).toBe(proof);
      firstRead.flush([]);
      expect(harness.routeNativeElement!.querySelector('dialog')).toBeNull();
      expect(sessionStorage.getItem(key)).toBe(proof);
      await harness.navigateByUrl('/admin/matches');
      await harness.navigateByUrl('/admin/bets');
      const secondRead = bets();
      expect(secondRead.request.headers.get('X-Admin-Tab')).toBe(proof);
      secondRead.flush([]);
      http.expectNone('/api/admin/security/verify');
      TestBed.inject(AuthService).logout(false);
      http.expectOne('/api/auth/logout').flush({ success: true });
      expect(sessionStorage.getItem(key)).toBeNull();
      http.verify();
    } finally {
      if (original) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      sessionStorage.removeItem(key);
    }
  });
});
