import { CommonModule } from '@angular/common';
import { Component, signal, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

type Credentials = { identifier: string; password: string };

@Component({
  selector: 'auth-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    identifier: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  submit() {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const credentials = this.form.getRawValue() as Credentials;

    this.auth.login(credentials).subscribe({
      next: () => {
        this.loading.set(false);
        this.notifications.success('Connexion reussie.');
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading.set(false);
        const message = err?.error?.message ?? 'Impossible de se connecter';
        this.error.set(message);
        this.notifications.error(message);
      },
    });
  }
}
