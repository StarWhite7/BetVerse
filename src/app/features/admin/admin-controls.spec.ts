import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BetsComponent } from './bets/bets.component';
import { UsersComponent } from './users/users.component';

describe('Admin controls', () => {
  let http: HttpTestingController;
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );

  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    if (originalShowModal)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });

  it('searches the full ticket list by pseudo and confirms an audited correction from the status column', async () => {
    const view = TestBed.createComponent(BetsComponent);
    const root = view.nativeElement as HTMLElement;
    const list = () => http.expectOne((req) => req.url === '/api/bet/admin-bets');
    view.detectChanges();
    list().flush([]);
    await view.whenStable();
    const username = root.querySelector<HTMLInputElement>('input[name="username"]')!;
    username.value = 'alice';
    username.dispatchEvent(new Event('input', { bubbles: true }));
    username.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const search = list();
    expect(search.request.params.get('username')).toBe('alice');
    expect(search.request.params.has('status')).toBe(false);
    const bet = {
      id: 'bet-1',
      username: 'alice',
      match: 'Home vs Away',
      amount: 100,
      odds: 1.8,
      status: 'PENDING',
      betType: 'HOME',
      sportKey: 'football',
      kind: 'SINGLE',
    };
    search.flush([bet], { headers: { 'X-Total-Count': '101' } });
    view.detectChanges();
    root.querySelector<HTMLButtonElement>('td button')!.click();
    view.detectChanges();
    await view.whenStable();
    expect(root.querySelector('dialog')?.textContent).toContain('alice');
    view.componentInstance.outcome = 'VOID';
    view.componentInstance.reason = 'Remboursement de recette.';
    root
      .querySelector('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const correction = http.expectOne({ method: 'PATCH', url: '/api/bet/admin-bets/bet-1/status' });
    expect(correction.request.body).toEqual({
      expectedStatus: 'PENDING',
      outcome: 'VOID',
      reason: 'Remboursement de recette.',
    });
    expect(correction.request.headers.has('Idempotency-Key')).toBe(true);
    correction.flush({ success: true });
    expect(view.componentInstance.target()).toBeNull();
    const reload = list();
    expect(reload.request.params.get('username')).toBe('alice');
    reload.flush([{ ...bet, status: 'VOID' }]);
  });

  it('credits the selected player and currency only after confirming the quantity', async () => {
    const view = TestBed.createComponent(UsersComponent);
    const root = view.nativeElement as HTMLElement;
    view.detectChanges();
    http.expectOne('/api/users').flush([
      {
        id: 'player-1',
        username: 'alice',
        email: 'alice@example.test',
        role: 'USER',
        balance: 10,
        shards: 100,
      },
    ]);
    view.detectChanges();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Ajouter Shards')!
      .click();
    view.detectChanges();
    await view.whenStable();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.textContent).toContain('alice');
    http.expectNone((req) => req.method === 'POST');
    const amount = dialog.querySelector('input')!;
    amount.value = '25';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    amount.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const credit = http.expectOne({ method: 'POST', url: '/api/wallet/admin-credit/player-1' });
    expect(credit.request.body).toEqual({ currency: 'SHARDS', amount: 25 });
    expect(credit.request.headers.has('Idempotency-Key')).toBe(true);
    credit.flush({ balance: 10, shards: 125 });
    view.detectChanges();
    expect(root.querySelector('dialog')).toBeNull();
    expect(root.textContent).toContain('125 Shards');
  });
});
