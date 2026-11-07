import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { AdminAccessService } from '../../services/admin-access.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, DialogDirective],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout implements OnInit {
  private readonly access = inject(AdminAccessService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly status = this.access.status;
  readonly checked = signal(false);
  readonly loadError = signal(false);
  readonly verifying = signal(false);
  readonly codeError = signal('');
  readonly challenge = computed(() => {
    const status = this.access.status();
    return this.checked() && status?.enrolled && !status.verified;
  });
  readonly needsSetup = computed(() => {
    const status = this.access.status();
    return this.checked() && status?.required && !status.enrolled;
  });
  readonly setupPage = computed(
    () =>
      this.router.lastSuccessfulNavigation()?.finalUrl?.toString().split(/[?#]/)[0] ===
      '/admin/security',
  );
  code = '';

  ngOnInit() {
    this.checkAccess();
  }

  checkAccess() {
    this.checked.set(false);
    this.loadError.set(false);
    this.access
      .read()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.checked.set(true),
        error: () => this.loadError.set(true),
      });
  }

  verify() {
    if (!this.challenge() || this.verifying() || !this.code.trim()) return;
    this.verifying.set(true);
    this.codeError.set('');
    const code = this.code.trim();
    this.code = '';
    this.access
      .verify(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.verifying.set(false),
        error: (error) => {
          this.verifying.set(false);
          this.codeError.set(
            error.status === 429
              ? 'Trop de tentatives. Réessayez dans quelques minutes.'
              : error.error?.message || 'Impossible de vérifier le code. Réessayez.',
          );
        },
      });
  }

  leave() {
    if (!this.verifying()) void this.router.navigateByUrl('/');
  }
}
