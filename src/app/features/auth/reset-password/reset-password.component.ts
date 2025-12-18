import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'auth-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly mismatch = signal(false);
  protected readonly token = signal<string | null>(null);

  protected readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    this.token.set(token);
    if (!token) {
      this.errorMessage.set('Lien invalide ou incomplet.');
    }
  }

  submit() {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.mismatch.set(false);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const password = this.form.value.password ?? '';
    const confirm = this.form.value.confirmPassword ?? '';

    if (password !== confirm) {
      this.mismatch.set(true);
      this.errorMessage.set('Les mots de passe ne correspondent pas.');
      return;
    }

    const token = this.token();
    if (!token) {
      this.errorMessage.set('Lien invalide ou expiré.');
      return;
    }

    this.loading.set(true);

    this.auth.resetPassword({ token, password }).subscribe({
      next: (response) => {
        this.loading.set(false);
        const message = response?.message ?? 'Mot de passe mis à jour.';
        this.successMessage.set(message);
        this.notifications.success(message);
        setTimeout(() => {
          this.router.navigate(['/auth/login']);
        }, 1500);
      },
      error: (err) => {
        this.loading.set(false);
        const message = err?.error?.message ?? 'Impossible de réinitialiser le mot de passe';
        this.errorMessage.set(message);
        this.notifications.error(message);
      },
    });
  }
}

