import { Component, OnInit, inject, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../../../core/config/environment';

interface FootballUsage {
  mode: string;
  configured: boolean;
  used: number;
  total: number;
  remaining: number;
  providerRemaining: number | null;
  lastCallAt: string | null;
}
interface FootballFixture {
  externalId: number;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
  competition: string;
  status: string;
  matchId: string | null;
  fetchedAt: string;
}
interface FootballState {
  usage: FootballUsage;
  fixtures?: FootballFixture[];
  bookmakers?: { id: number; name: string }[];
  cached?: boolean;
}

@Component({
  selector: 'admin-football-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section aria-labelledby="football-title">
      <h2 id="football-title">API Football — import manuel</h2>
      <p>Ouvrir cette page lit uniquement les données enregistrées sur BetVerse.</p>
      @if (usage(); as quota) {
        <p>
          Mode : {{ quota.mode }} · Appels sur 24 h glissantes : {{ quota.used }} /
          {{ quota.total }}.
        </p>
        @if (quota.providerRemaining !== null) {
          <p>
            Quota fournisseur restant au dernier appel : {{ quota.providerRemaining }} ({{
              quota.lastCallAt | date: 'dd/MM HH:mm'
            }}).
          </p>
        }
        @if (!quota.configured) {
          <p>
            Import désactivé. La configuration se fait uniquement dans les variables du serveur
            Render.
          </p>
        }
      }
      <p role="status">{{ message() }}</p>
      <fieldset [disabled]="busy() || !usage()?.configured">
        <legend>Actions volontaires — au maximum une requête fournisseur par clic</legend>
        <label class="consent">
          <input type="checkbox" [(ngModel)]="accepted" />
          J’autorise le prochain appel à consommer une requête de mon quota.
        </label>
        <div class="controls">
          <label>Date (UTC)<input type="date" [(ngModel)]="date" /></label>
          <label
            >ID compétition (facultatif)<input type="number" min="1" [(ngModel)]="league"
          /></label>
          <label
            >Saison (année de début, facultatif)<input
              type="number"
              min="2000"
              max="2100"
              [(ngModel)]="season"
          /></label>
          <button
            type="button"
            [disabled]="!accepted || !date || (!!season && !league)"
            (click)="loadFixtures()"
          >
            Charger le calendrier (≤ 1 requête)
          </button>
        </div>
        <div class="controls">
          <button type="button" [disabled]="!accepted" (click)="run('bookmakers', {})">
            Charger les bookmakers (≤ 1 requête)
          </button>
          <label
            >Bookmaker pour les cotes
            <select [(ngModel)]="bookmakerId">
              <option [ngValue]="null">Choisir un bookmaker</option>
              @for (bookmaker of bookmakers(); track bookmaker.id) {
                <option [ngValue]="bookmaker.id">{{ bookmaker.name }}</option>
              }
            </select>
          </label>
        </div>
        <p>
          Cache d’une heure conservé après déploiement. Aucun rafraîchissement automatique. Les
          cotes et les résultats restent figés jusqu’à une action administrative.
        </p>
        <div class="fixtures">
          @for (fixture of fixtures(); track fixture.externalId) {
            <article>
              <div>
                <strong>{{ fixture.homeTeam }} — {{ fixture.awayTeam }}</strong>
                <p>
                  {{ fixture.competition }} · {{ fixture.startDate | date: 'dd/MM/yyyy HH:mm' }} ·
                  {{ fixture.status }}
                </p>
                <small
                  >Calendrier chargé le {{ fixture.fetchedAt | date: 'dd/MM HH:mm' }}
                  {{ fixture.matchId ? '· Déjà publié' : '· Non publié' }}</small
                >
              </div>
              <button
                type="button"
                [disabled]="!accepted || !bookmakerId || !canImport(fixture)"
                (click)="run('odds', { fixtureId: fixture.externalId, bookmakerId })"
              >
                {{ fixture.matchId ? 'Actualiser les cotes' : 'Importer les cotes et publier' }} (≤
                1 requête)
              </button>
            </article>
          } @empty {
            <p>Aucun calendrier chargé. Choisissez une date, puis lancez le chargement.</p>
          }
        </div>
      </fieldset>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-block: 1.5rem;
    }
    section {
      padding: 1.25rem;
      border: 1px solid #475569;
      border-radius: 1rem;
      background: #111827;
      color: #f8fafc;
    }
    fieldset {
      border: 0;
      padding: 0;
      min-width: 0;
    }
    legend {
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: end;
      margin-block: 1rem;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .consent {
      flex-direction: row;
      align-items: center;
    }
    input,
    select,
    button {
      padding: 0.7rem;
      border: 1px solid #64748b;
      border-radius: 0.5rem;
      background: #1e293b;
      color: #f8fafc;
    }
    button {
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    article {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      padding-block: 1rem;
      border-top: 1px solid #475569;
    }
    p {
      line-height: 1.5;
    }
  `,
})
export class FootballImportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/football`;
  readonly imported = output<void>();
  readonly usage = signal<FootballUsage | null>(null);
  readonly fixtures = signal<FootballFixture[]>([]);
  readonly bookmakers = signal<{ id: number; name: string }[]>([]);
  readonly busy = signal(false);
  readonly message = signal('');
  accepted = false;
  date = new Date().toISOString().slice(0, 10);
  league: number | null = null;
  season: number | null = null;
  bookmakerId: number | null = null;

  ngOnInit() {
    this.http.get<FootballState>(this.url).subscribe({
      next: (state) => this.apply(state),
      error: () => this.message.set('Impossible de lire la configuration de l’import.'),
    });
  }

  canImport(fixture: FootballFixture) {
    return fixture.status === 'NS' && Date.parse(fixture.startDate) > Date.now();
  }

  loadFixtures() {
    this.run('fixtures', {
      date: this.date,
      ...(this.league ? { league: this.league } : {}),
      ...(this.season ? { season: this.season } : {}),
    });
  }

  run(action: 'fixtures' | 'bookmakers' | 'odds', payload: object) {
    if (this.busy() || !this.accepted || !this.usage()?.configured) return;
    this.accepted = false;
    this.busy.set(true);
    this.message.set('Traitement en cours…');
    this.http
      .post<FootballState>(`${this.url}/${action}`, payload, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      .subscribe({
        next: (state) => {
          this.apply(state);
          this.busy.set(false);
          this.message.set(
            state.cached
              ? 'Données reprises du cache : aucun quota consommé.'
              : 'Action terminée : une requête fournisseur envoyée.',
          );
          if (action === 'odds') this.imported.emit();
        },
        error: (error) => {
          this.busy.set(false);
          this.message.set(
            error?.error?.message ?? 'Échec de l’action. Aucune relance automatique.',
          );
          // Read our local journal only, including failed requests counted conservatively.
          this.http
            .get<FootballState>(this.url)
            .subscribe({ next: (state) => this.apply(state), error: () => {} });
        },
      });
  }

  private apply(state: FootballState) {
    this.usage.set(state.usage);
    if (state.fixtures) this.fixtures.set(state.fixtures);
    if (state.bookmakers) this.bookmakers.set(state.bookmakers);
  }
}
