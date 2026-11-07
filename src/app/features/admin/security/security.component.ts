import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AdminAccessService } from '../../../core/services/admin-access.service';
import { authenticatorQr, AuthenticatorQr } from './authenticator-qr';
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `<h2>Sécurité administrateur</h2>
    <p>
      Une application d’authentification protège les actions administratives. La vérification
      s’applique à cet onglet jusqu’à la fin de la connexion.
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
          @if (qr(); as image) {
            <p>
              Scannez ce QR code avec votre application d’authentification, puis saisissez son code
              ci-dessous.
            </p>
            <svg
              class="authenticator-qr"
              role="img"
              aria-label="QR code de configuration du second facteur BetVerse"
              [attr.viewBox]="'0 0 ' + image.size + ' ' + image.size"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="100%" height="100%" fill="#ffffff" />
              <path [attr.d]="image.path" fill="#000000" />
            </svg>
            <p>QR code généré sur cet appareil. Ne partagez ni ce code ni la clé privée.</p>
          }
          <details>
            <summary>Saisir la clé manuellement</summary>
            <p>Émetteur BetVerse · TOTP · 6 chiffres · période 30 secondes.</p>
            <code style="overflow-wrap:anywhere">{{ secret() }}</code>
          </details>
        }
        @if (secret()) {
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
  styles: [
    `
      .authenticator-qr {
        display: block;
        width: 320px;
        max-width: 100%;
        height: auto;
        aspect-ratio: 1;
        background: #fff;
        shape-rendering: crispEdges;
        margin: 1rem 0;
      }
      summary {
        cursor: pointer;
      }
    `,
  ],
})
export class SecurityComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly access = inject(AdminAccessService);
  readonly status = this.access.status;
  readonly secret = signal('');
  readonly qr = signal<AuthenticatorQr | null>(null);
  readonly recovery = signal<string[]>([]);
  readonly message = signal('');
  readonly error = signal(false);
  readonly busy = signal(false);
  password = '';
  code = '';
  ngOnInit() {
    this.read();
  }
  ngOnDestroy() {
    this.secret.set('');
    this.qr.set(null);
    this.recovery.set([]);
    this.password = '';
    this.code = '';
  }
  read() {
    this.access.read().subscribe({ error: (e) => this.failed(e) });
  }
  setup() {
    if (this.busy()) return;
    this.busy.set(true);
    this.secret.set('');
    this.qr.set(null);
    this.recovery.set([]);
    this.message.set('');
    this.error.set(false);
    this.http
      .post<{ secret: string; account: string }>('/api/admin/security/setup', {
        password: this.password,
      })
      .subscribe({
        next: (v) => {
          this.password = '';
          this.secret.set(v.secret);
          try {
            this.qr.set(authenticatorQr(v.secret, v.account));
          } catch {
            this.message.set('QR code indisponible. Utilisez la saisie manuelle.');
          }
          this.busy.set(false);
        },
        error: (e) => {
          this.password = '';
          this.failed(e);
        },
      });
  }
  verify() {
    if (this.busy()) return;
    this.busy.set(true);
    this.access.verify(this.code.trim(), !!this.secret()).subscribe({
      next: (v) => {
        this.code = '';
        this.secret.set('');
        this.qr.set(null);
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
