import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `<h2>Sécurité administrateur</h2>
    <p>
      Une application d’authentification protège les actions administratives. Chaque vérification
      est valable 30 minutes.
    </p>
    <section class="bv-panel">
      @if (status(); as data) {
        <p>
          Configuration serveur : {{ data.configured ? 'prête' : 'à configurer' }} · Second facteur
          : {{ data.enrolled ? 'activé' : 'non activé' }} · Session :
          {{ data.verified ? 'vérifiée' : 'à vérifier' }}
        </p>
        @if (!data.configured) {
          <p>
            Configurer ADMIN_MFA_KEY sur Render (32 octets aléatoires, 64 caractères hexadécimaux).
            Conserver sa sauvegarde privée. ADMIN_MFA_REQUIRED=1 peut ensuite imposer l’enrôlement à
            tous les administrateurs.
          </p>
        }
        @if (!data.enrolled || data.verified) {
          <label
            >Mot de passe actuel<input
              type="password"
              [(ngModel)]="password"
              autocomplete="current-password" /></label
          ><button (click)="setup()" [disabled]="busy() || !data.configured || !password">
            {{ data.enrolled ? 'Remplacer mon second facteur' : 'Configurer mon second facteur' }}
          </button>
        }
        @if (secret()) {
          <p>
            Ajouter manuellement dans votre application d’authentification : émetteur BetVerse, type
            TOTP, 6 chiffres, période 30 secondes.
          </p>
          <p>Clé privée à enregistrer dans l’application, jamais dans un message :</p>
          <code style="overflow-wrap:anywhere">{{ secret() }}</code>
        }
        @if (data.enrolled || secret()) {
          <label
            >Code de l’application ou code de récupération<input
              [(ngModel)]="code"
              autocomplete="one-time-code"
              maxlength="32" /></label
          ><button (click)="verify()" [disabled]="busy() || !code">
            Vérifier et autoriser ma session
          </button>
        }
        @if (recovery().length) {
          <h3>Codes de récupération — affichés une seule fois</h3>
          <p>
            Conservez-les dans votre gestionnaire de mots de passe. Chaque code est utilisable une
            seule fois.
          </p>
          <ul>
            @for (value of recovery(); track value) {
              <li>
                <code>{{ value }}</code>
              </li>
            }
          </ul>
        }
      }
    </section>
    <p role="status" [class.bv-error]="error()">{{ message() }}</p>
    <a routerLink="/admin">Retour à l’administration</a>`,
})
export class SecurityComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly status = signal<{ configured: boolean; enrolled: boolean; verified: boolean } | null>(
    null,
  );
  readonly secret = signal('');
  readonly recovery = signal<string[]>([]);
  readonly message = signal('');
  readonly error = signal(false);
  readonly busy = signal(false);
  password = '';
  code = '';
  ngOnInit() {
    this.read();
  }
  read() {
    this.http
      .get<{ configured: boolean; enrolled: boolean; verified: boolean }>('/api/admin/security')
      .subscribe({ next: (v) => this.status.set(v), error: (e) => this.failed(e) });
  }
  setup() {
    this.busy.set(true);
    this.http
      .post<{ secret: string }>('/api/admin/security/setup', { password: this.password })
      .subscribe({
        next: (v) => {
          this.password = '';
          this.secret.set(v.secret);
          this.busy.set(false);
        },
        error: (e) => {
          this.password = '';
          this.failed(e);
        },
      });
  }
  verify() {
    this.busy.set(true);
    this.http
      .post<{ recoveryCodes?: string[] }>('/api/admin/security/verify', {
        code: this.code,
        setup: !!this.secret(),
      })
      .subscribe({
        next: (v) => {
          this.code = '';
          this.secret.set('');
          this.recovery.set(v.recoveryCodes || []);
          this.busy.set(false);
          this.error.set(false);
          this.message.set('Session administrateur vérifiée.');
          this.read();
        },
        error: (e) => {
          this.code = '';
          this.failed(e);
        },
      });
  }
  private failed(e: any) {
    this.busy.set(false);
    this.error.set(true);
    this.message.set(e?.error?.message || 'Opération impossible.');
  }
}
