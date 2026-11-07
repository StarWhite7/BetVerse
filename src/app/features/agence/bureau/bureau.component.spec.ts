import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AgenceBureauComponent } from './bureau.component';
import { AuthService } from '../../../core/services/auth.service';

describe('Suppression d’agence depuis le bureau web', () => {
  it('envoie la suppression en JSON et affiche un refus avant de permettre un nouvel essai', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const director = { id: 'director', role: 'USER' as const, email: 'director@example.test' };
    TestBed.inject(AuthService).syncUser(director);
    const view = TestBed.createComponent(AgenceBureauComponent);
    view.detectChanges();
    http.expectOne('/api/agence/roster').flush({
      id: 'agency',
      members: [{ id: director.id, agencyRole: 'DIRECTEUR' }],
    });
    view.detectChanges();
    const page = view.nativeElement as HTMLElement;
    Array.from(page.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === "Supprimer l'agence")!
      .click();
    view.detectChanges();
    const dialog = page.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector('input')!;
    input.value = 'DELETE';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Supprimer',
    )!;
    confirm.click();
    const deletion = http.expectOne({ method: 'DELETE', url: '/api/agence' });
    expect(deletion.request.detectContentTypeHeader()).toBe('application/json');
    deletion.flush({ message: 'Direction requise.' }, { status: 403, statusText: 'Forbidden' });
    view.detectChanges();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Direction requise.');
    expect(navigate).not.toHaveBeenCalled();
    confirm.click();
    http.expectOne({ method: 'DELETE', url: '/api/agence' }).flush({ success: true });
    http.expectOne('/api/auth/me').flush(director);
    view.detectChanges();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/agence']);
    http.verify();
  });
});
