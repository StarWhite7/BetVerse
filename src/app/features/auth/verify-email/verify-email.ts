import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
@Component({
  selector: 'auth-verify-email',
  standalone: true,
  imports: [RouterLink],
  template: ` <section class="verification">
    <h1>Confirmer mon adresse</h1>
    <p>Confirme ton adresse pour activer ton compte BetVerse.</p>
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
    @if (!done()) {
      <button type="button" (click)="verify()" [disabled]="loading()">
        {{ loading() ? 'Confirmation…' : 'Confirmer mon adresse' }}
      </button>
    }
    <p><a routerLink="/auth/login">Retour à la connexion</a></p>
  </section>`,
  styles:
    '.verification{max-width:450px;padding:2rem;color:#e2e8f0;} button{padding:.75rem 1rem;cursor:pointer;}',
})
export class VerifyEmailComponent {
  private readonly auth = inject(AuthService);
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');
  loading = signal(false);
  done = signal(false);
  message = signal('');
  verify() {
    if (!this.token) {
      this.message.set('Lien invalide. Demande un nouveau lien depuis la connexion.');
      return;
    }
    if (this.loading()) return;
    this.loading.set(true);
    this.auth.verifyEmail(this.token).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.done.set(true);
        this.message.set(result.message);
        history.replaceState(null, '', location.pathname);
      },
      error: (error) => {
        this.loading.set(false);
        this.message.set(error?.error?.message ?? 'Confirmation impossible.');
      },
    });
  }
}
