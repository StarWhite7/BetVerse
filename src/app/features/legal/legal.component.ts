import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
const PAGES: Record<string, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: 'Confidentialité',
    paragraphs: [
      'BetVerse est édité sous le nom StarWhite Interactive, en France. Contact prévu : support@betverse.fr.',
      'Données utilisées : adresse email, pseudo, mot de passe haché, session, paris en monnaie virtuelle, mouvements du portefeuille, progression, agence, pronostics collectifs et notifications. Aucun mot de passe en clair n’est conservé.',
      'Ces données servent à sécuriser le compte, confirmer l’adresse email, faire fonctionner le jeu et les agences, fournir les notifications demandées et prévenir les abus.',
      'Le backend est hébergé sur Render ; Brevo envoie les emails transactionnels. Firebase App Distribution distribue la bêta Android aux testeurs invités. Les fournisseurs sportifs n’ont pas besoin de l’identité des joueurs pour charger les rencontres.',
      'Vous pouvez exporter vos données et supprimer votre compte dans l’application ou sur la page dédiée. Les données du compte sont conservées tant qu’il reste actif. La suppression efface la base active ; les sauvegardes suivent leur rotation et ne doivent pas réactiver les comptes supprimés.',
      'Le site utilise une session nécessaire au fonctionnement et une préférence locale de thème. Aucune publicité ni achat de monnaie virtuelle n’est actif. Les éventuelles notifications push nécessitent une activation et une autorisation distinctes.',
    ],
  },
  rules: {
    title: 'Règles du jeu',
    paragraphs: [
      'BetVerse est un jeu gratuit. Verse et Shards n’ont aucune valeur monétaire : aucun retrait ni gain en argent.',
      'Bonus : 500 Verse réclamables toutes les 24 heures. Création d’une agence : 100 Shards. Capacité d’une agence : 50 membres.',
      'La mise est un entier de 1 à 1 000 000 Verse, dans la limite du solde. Le serveur vérifie l’ouverture du match et ses cotes lors de la confirmation. Les cotes acceptées sont conservées.',
      'Un combiné contient 2 à 10 rencontres distinctes, un choix par rencontre et une seule mise. La cote totale est le produit des cotes, arrondi une fois à deux décimales. Le retour, mise incluse, est arrondi au Verse le plus proche, demi supérieur. Cote totale maximale : 1 000 000.',
      'Une sélection perdante perd le combiné. Une annulation neutralise la rencontre à cote 1 ; toutes annulées remboursent la mise. Sinon, paiement après résolution de toutes les rencontres.',
      'Les résultats sont validés par l’administration. Les données ne sont pas garanties en direct. Aucun pari après l’heure de début enregistrée. Les abus peuvent entraîner une suspension motivée.',
    ],
  },
  terms: {
    title: 'Conditions de la bêta',
    paragraphs: [
      'StarWhite Interactive propose en France une bêta privée de jeu gratuit en monnaie virtuelle. Les identifiants restent personnels ; les profils doivent respecter les autres joueurs.',
      'Les soldes ne sont ni une créance monétaire ni un investissement. Aucun achat ni échange contre de l’argent n’est proposé. Le service peut connaître des interruptions ou des ajustements pendant la bêta ; les changements substantiels seront annoncés.',
      'Les abus, la fraude et les comportements contraires aux règles peuvent entraîner une suspension motivée et journalisée. Un joueur peut exporter ses données ou supprimer son compte.',
      'Les mentions administratives complètes et les conditions définitives doivent être vérifiées avant l’ouverture publique.',
    ],
  },
  support: {
    title: 'Aide et support',
    paragraphs: [
      'Éditeur : StarWhite Interactive · France. Adresse de support prévue : support@betverse.fr.',
      'Pour signaler un problème : version de l’application, étapes et identifiant du ticket si nécessaire. Ne transmettez jamais de mot de passe, clé API ou code de double authentification.',
    ],
  },
};
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: ` <main style="max-width:850px;margin:auto;padding:2rem 1rem">
    <a routerLink="/"
      ><img
        class="bv-logo"
        [src]="
          theme.dark() ? '/brand/betverse-wordmark-dark.svg' : '/brand/betverse-wordmark-light.svg'
        "
        alt="BetVerse"
    /></a>
    <nav class="bv-toolbar" style="margin-block:1.5rem">
      <a routerLink="/legal/privacy">Confidentialité</a
      ><a routerLink="/legal/rules">Règles du jeu</a><a routerLink="/legal/terms">Conditions</a
      ><a routerLink="/legal/support">Support</a
      ><a routerLink="/legal/delete-account">Supprimer mon compte</a>
    </nav>
    @if (!meta()?.ready) {
      <p class="bv-panel">
        Bêta privée : les informations administratives et la réception du support sont en cours de
        finalisation avant l’ouverture publique.
      </p>
    }
    @if (page() === 'delete-account') {
      <h1>Supprimer mon compte et mes données</h1>
      <section class="bv-panel">
        <p>Vous pouvez supprimer votre compte BetVerse ici sans réinstaller l’application.</p>
        @if (!auth.currentUser()) {
          <label>Email ou pseudo<input [(ngModel)]="identifier" autocomplete="username" /></label
          ><label
            >Mot de passe<input
              type="password"
              [(ngModel)]="loginPassword"
              autocomplete="current-password"
          /></label>
          <button (click)="login()" [disabled]="busy() || !identifier || !loginPassword">
            Me connecter
          </button>
          <p><a routerLink="/auth/forgot-password">Mot de passe oublié</a></p>
        } @else {
          <p>Compte : {{ auth.currentUser()?.username }}</p>
          <p>
            Vos paris, soldes virtuels et données seront effacés. La direction de votre agence sera
            transmise au membre le plus ancien, ou l’agence supprimée si vous êtes seul. Cette
            action est irréversible.
          </p>
          <button (click)="export()" [disabled]="busy()">
            Exporter mes données avant suppression
          </button>
          <label
            >Confirmer avec mon mot de passe<input
              type="password"
              [(ngModel)]="password"
              autocomplete="current-password" /></label
          ><label>Saisir SUPPRIMER<input [(ngModel)]="confirmation" autocomplete="off" /></label>
          <button
            (click)="erase()"
            [disabled]="busy() || confirmation !== 'SUPPRIMER' || !password"
          >
            Supprimer définitivement mon compte
          </button>
        }
      </section>
    } @else {
      <h1>{{ content().title }}</h1>
      <section class="bv-panel">
        @for (paragraph of content().paragraphs; track paragraph) {
          <p>{{ paragraph }}</p>
        }
        @if (page() === 'support') {
          <p>
            {{
              meta()?.supportVerified
                ? 'La réception du support est confirmée.'
                : 'La boîte support@betverse.fr est en cours de configuration ; sa réception n’est pas encore confirmée.'
            }}
          </p>
        }
        @if (meta()?.address) {
          <p>Adresse de l’éditeur : {{ meta()?.address }}</p>
          <p>Statut : {{ meta()?.status }}</p>
        }
        <a routerLink="/legal/delete-account">Gérer et supprimer mes données</a>
      </section>
    }
    <p role="status" [class.bv-error]="error()">{{ message() }}</p>
    <p class="bv-muted">6 novembre 2026 · Monnaie virtuelle, aucun gain en argent.</p>
  </main>`,
})
export class LegalComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly http = inject(HttpClient);
  readonly page = signal('privacy');
  readonly meta = signal<{
    ready: boolean;
    supportVerified: boolean;
    address?: string;
    status?: string;
  } | null>(null);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly message = signal('');
  identifier = '';
  loginPassword = '';
  password = '';
  confirmation = '';
  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.page.set(params.get('page') || 'privacy'));
    this.http
      .get<{ ready: boolean; supportVerified: boolean; address?: string; status?: string }>(
        '/api/public/legal',
      )
      .subscribe({ next: (v) => this.meta.set(v), error: () => {} });
  }
  content() {
    return PAGES[this.page()] || PAGES['support'];
  }
  login() {
    this.busy.set(true);
    this.auth.login({ identifier: this.identifier, password: this.loginPassword }).subscribe({
      next: () => {
        this.loginPassword = '';
        this.busy.set(false);
      },
      error: (e) => this.failure(e),
    });
  }
  export() {
    this.busy.set(true);
    this.http.get('/api/users/me/export').subscribe({
      next: (json) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = 'betverse-mes-donnees.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.busy.set(false);
      },
      error: (e) => this.failure(e),
    });
  }
  erase() {
    this.busy.set(true);
    this.http
      .delete('/api/users/me', {
        body: { password: this.password, confirmation: this.confirmation },
      })
      .subscribe({
        next: () => {
          this.password = '';
          this.confirmation = '';
          this.message.set('Votre compte et ses données ont été supprimés.');
          this.error.set(false);
          this.auth
            .fetchProfile()
            .subscribe({ next: () => this.busy.set(false), error: () => this.busy.set(false) });
        },
        error: (e) => this.failure(e),
      });
  }
  private failure(e: any) {
    this.busy.set(false);
    this.error.set(true);
    this.message.set(e?.error?.message || 'Opération impossible. Réessayez.');
  }
}
