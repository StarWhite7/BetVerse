import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  strongPasswordValidator,
  matchControlValidator,
} from '../../../shared/utils/validators';

type Credentials = { email: string; password: string; username: string };

@Component({
  selector: 'auth-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(24),
          Validators.pattern(/^[a-zA-Z0-9_.-]+$/),
        ],
      ],
      password: [
        '',
        [Validators.required, strongPasswordValidator()],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchControlValidator('password', 'confirmPassword') },
  );

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  submit() {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password, username } = this.form.getRawValue();
    const credentials: Credentials = {
      email: email ?? '',
      password: password ?? '',
      username: (username ?? '').toLowerCase(),
    };

    this.loading.set(true);
    this.error.set(null);

    this.auth
      .register(credentials)
      .pipe(
        switchMap(() =>
          this.auth.login({
            identifier: credentials.email,
            password: credentials.password,
          }),
        ),
      )
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.notifications.success('Compte cree, connexion en cours.');
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.loading.set(false);
          const message = err?.error?.message ?? 'Impossible de creer le compte';
          this.error.set(message);
          this.notifications.error(message);
        },
      });
  }
}
