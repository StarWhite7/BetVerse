import { Component, OnInit, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../core/config/environment';

interface Quote {
  bookmaker: string;
  home: number;
  draw: number;
  away: number;
  updatedAt: number;
}
interface OddsFixture {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  startDate: string;
  quotes: Quote[];
  fetchedAt: number;
  snapshotId: string;
  matchId: string | null;
}
interface OddsState {
  usage: {
    mode: string;
    configured: boolean;
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
    providerRemaining: number | null;
    lastCallAt: number | null;
    providerCheckedAt: number | null;
    lastError: string | null;
  };
  competitions: Record<string, string>;
  bookmakers: Record<string, string>;
  fixtures: OddsFixture[];
  cached?: boolean;
}

@Component({
  selector: 'admin-odds-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section aria-labelledby="odds-title">
      <h2 id="odds-title">The Odds API — matchs et cotes 1N2</h2>
      <p>
        Aucun appel automatique. Ouvrir cette page ou publier un aperçu ne consomme aucun crédit.
      </p>
      @if (state(); as data) {
        <p>
          Mode : {{ data.usage.mode }} · Tentatives sur 24 h : {{ data.usage.dailyUsed }} /
          {{ data.usage.dailyLimit }} · Sur 31 jours glissants : {{ data.usage.monthlyUsed }} /
          {{ data.usage.monthlyLimit }}.
        </p>
        @if (data.usage.providerRemaining !== null) {
          <p>
            Crédits fournisseur restants au dernier appel : {{ data.usage.providerRemaining }} ({{
              data.usage.providerCheckedAt | date: 'dd/MM HH:mm'
            }}).
          </p>
        }
        @if (!data.usage.configured) {
          <p>
            Configurer THE_ODDS_API_MODE=manual et THE_ODDS_API_KEY dans Render pour autoriser les
            imports.
          </p>
        }
        @if (data.usage.lastError) {
          <p>Dernier échec : {{ data.usage.lastError }}</p>
        }
        <fieldset [disabled]="busy() || !data.usage.configured">
          <legend>Charger les sept jours à partir de la date choisie (UTC)</legend>
          <div class="controls">
            <label
              >Compétition
              <select [(ngModel)]="competition">
                @for (entry of data.competitions | keyvalue; track entry.key) {
                  <option [value]="entry.key">{{ entry.value }}</option>
                }
              </select>
            </label>
            <label
              >Premier jour (UTC)<input
                type="date"
                [(ngModel)]="date"
                [min]="minDate"
                [max]="maxDate"
            /></label>
          </div>
          <label class="consent"
            ><input type="checkbox" [(ngModel)]="accepted" /> J’autorise un appel manuel, estimé à 1
            crédit (région France, marché 1N2).</label
          >
          <button type="button" [disabled]="!accepted || !date" (click)="preview()">
            Charger l’aperçu (≤ 1 appel)
          </button>
        </fieldset>
        <p>
          Seuls Betclic France, Winamax France et Unibet France sont proposés. Une absence de cote
          ne déclenche aucun autre appel. Les compétitions hors saison peuvent ne rien retourner.
        </p>
        <p>
          Cache d’une heure conservé après déploiement. Publication possible pendant une heure au
          plus après la mise à jour des cotes. Les résultats sont à saisir manuellement dans
          l’administration.
        </p>
        <div class="controls">
          <label
            >Bookmaker à publier
            <select [(ngModel)]="bookmaker" [disabled]="busy()">
              @for (entry of data.bookmakers | keyvalue; track entry.key) {
                <option [value]="entry.key">{{ entry.value }}</option>
              }
            </select>
          </label>
          <button type="button" [disabled]="busy()" (click)="read()">
            Relire les données locales (0 crédit)
          </button>
        </div>
        @for (fixture of data.fixtures; track fixture.externalId) {
          <article>
            <strong>{{ fixture.homeTeam }} — {{ fixture.awayTeam }}</strong>
            <p>
              {{ fixture.competition }} · {{ fixture.startDate | date: 'dd/MM/yyyy HH:mm' }} (heure
              locale)
            </p>
            @if (quote(fixture); as price) {
              <p>
                1 : {{ price.home / 100 | number: '1.2-2' }} · N :
                {{ price.draw / 100 | number: '1.2-2' }} · 2 :
                {{ price.away / 100 | number: '1.2-2' }} · {{ data.bookmakers[price.bookmaker] }} ·
                Mise à jour : {{ price.updatedAt | date: 'dd/MM HH:mm' }}
              </p>
              <button
                type="button"
                [disabled]="busy() || !canPublish(fixture)"
                (click)="publish(fixture)"
              >
                {{ fixture.matchId ? 'Actualiser le match publié' : 'Publier ce match' }} (0 crédit)
              </button>
              @if (!canPublish(fixture)) {
                <p>Aperçu expiré ou rencontre commencée.</p>
              }
            } @else {
              <p>Aucune cote 1N2 complète et récente pour ce bookmaker.</p>
            }
          </article>
        } @empty {
          <p>Aucun aperçu de rencontre future enregistré.</p>
        }
      }
      <p role="status" aria-live="polite">{{ message() }}</p>
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
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 1rem;
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
      margin-block: 1rem;
    }
    input,
    select,
    button {
      padding: 0.7rem;
      border: 1px solid #64748b;
      border-radius: 0.5rem;
      background: #1e293b;
      color: #f8fafc;
      max-width: 100%;
    }
    button {
      cursor: pointer;
      min-height: 44px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    article {
      padding-block: 1rem;
      border-top: 1px solid #475569;
    }
    p {
      line-height: 1.5;
    }
  `,
})
export class OddsImportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/odds`;
  readonly imported = output<void>();
  readonly state = signal<OddsState | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly minDate = new Date().toISOString().slice(0, 10);
  readonly maxDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  accepted = false;
  date = this.minDate;
  competition = 'soccer_france_ligue_one';
  bookmaker = 'betclic_fr';
  ngOnInit() {
    this.read();
  }
  read() {
    this.http.get<OddsState>(this.url).subscribe({
      next: (data) => this.state.set(data),
      error: () => this.message.set('Impossible de lire les données locales de The Odds API.'),
    });
  }
  quote(fixture: OddsFixture) {
    return fixture.quotes.find((q) => q.bookmaker === this.bookmaker);
  }
  canPublish(fixture: OddsFixture) {
    const quote = this.quote(fixture);
    return (
      !!quote &&
      Date.parse(fixture.startDate) > Date.now() &&
      fixture.fetchedAt > Date.now() - 3600000 &&
      quote.updatedAt > Date.now() - 3600000
    );
  }
  preview() {
    if (this.busy() || !this.accepted || !this.state()?.usage.configured) return;
    this.accepted = false;
    this.run('preview', { competition: this.competition, date: this.date, consent: true });
  }
  publish(fixture: OddsFixture) {
    if (this.busy() || !this.canPublish(fixture)) return;
    this.run('publish', {
      eventId: fixture.externalId,
      bookmaker: this.bookmaker,
      snapshotId: fixture.snapshotId,
    });
  }
  private run(action: 'preview' | 'publish', body: object) {
    this.busy.set(true);
    this.message.set('Traitement en cours…');
    this.http
      .post<OddsState>(`${this.url}/${action}`, body, {
        headers: action === 'preview' ? { 'Idempotency-Key': crypto.randomUUID() } : {},
      })
      .subscribe({
        next: (data) => {
          this.state.set(data);
          this.busy.set(false);
          this.message.set(
            action === 'publish'
              ? 'Match publié depuis l’aperçu : aucun crédit consommé.'
              : data.cached
                ? 'Aperçu repris du cache : aucun crédit consommé.'
                : 'Aperçu chargé avec un seul appel fournisseur. Aucun match publié automatiquement.',
          );
          if (action === 'publish') this.imported.emit();
        },
        error: (error) => {
          this.busy.set(false);
          this.message.set(error?.error?.message ?? 'Échec. Aucune relance automatique.');
          this.read();
        },
      });
  }
}
