import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'auth-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css',
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  protected readonly loading = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    identifier: ['', [Validators.required, Validators.minLength(3)]],
  });

  submit() {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const identifier = this.form.value.identifier ?? '';

    this.auth
      .requestPasswordReset({ identifier })
      .subscribe({
        next: (response) => {
          this.loading.set(false);
          const message = response?.message ?? 'Si un compte existe, un email a été envoyé.';
          this.successMessage.set(message);
          this.notifications.success(message);
        },
        error: (err) => {
          this.loading.set(false);
          const message = err?.error?.message ?? 'Impossible de traiter la requête';
          this.errorMessage.set(message);
          this.notifications.error(message);
        },
      });
  }
}

