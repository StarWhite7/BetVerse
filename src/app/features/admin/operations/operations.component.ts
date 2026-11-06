import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
interface ResultRow {
  matchId: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore: number;
  awayScore: number;
  result?: string;
}
interface Summary {
  users: { total: number; suspended: number };
  tickets: { total: number; pending: number };
  toSettle: { id: string; homeTeam: string; awayTeam: string; startDate: string }[];
  audit: { action: string; createdAt: string; targetId: string }[];
  backup: { configured: boolean; lastSuccess?: string; lastError?: string };
  metrics: { requests: number; serverErrors: number; p95Ms: number; uptimeSeconds: number };
}
@Component({
  selector: 'bv-operations',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: ` <section class="bv-panel">
    <a routerLink="/admin">Administration</a>
    <h1>Exploitation et résultats</h1>
    <p>
      Les lectures et l’import de résultats ci-dessous utilisent uniquement BetVerse. Aucun appel
      sportif.
    </p>
    @if (error()) {
      <p role="alert" class="bv-error">{{ error() }}</p>
    }
    <button (click)="load()" [disabled]="busy()">Actualiser les données locales</button>
    @if (summary(); as s) {
      <p>
        {{ s.users.total }} comptes · {{ s.users.suspended || 0 }} suspendus ·
        {{ s.tickets.pending || 0 }} tickets en attente
      </p>
      <h2>Rencontres à régler</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Identifiant</th>
              <th>Rencontre</th>
              <th>Début UTC</th>
            </tr>
          </thead>
          <tbody>
            @for (m of s.toSettle; track m.id) {
              <tr>
                <td>
                  <code>{{ m.id }}</code>
                </td>
                <td>{{ m.homeTeam }} — {{ m.awayTeam }}</td>
                <td>{{ m.startDate }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <h2>Importer les scores vérifiés</h2>
      <p>
        Une ligne par match : <code>identifiant;score domicile;score extérieur</code>. Vérifiez la
        source officielle avant le règlement définitif.
      </p>
      <textarea
        [(ngModel)]="input"
        aria-label="Scores vérifiés"
        rows="6"
        [disabled]="busy()"
      ></textarea>
      <button (click)="preview()" [disabled]="busy() || !input.trim()">
        Vérifier l’aperçu (0 crédit)
      </button>
      @if (receipt(); as p) {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rencontre</th>
                <th>Score final</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              @for (row of p.rows; track row.matchId) {
                <tr>
                  <td>{{ row.homeTeam }} — {{ row.awayTeam }}</td>
                  <td>{{ row.homeScore }} : {{ row.awayScore }}</td>
                  <td>{{ row.result }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <label
          ><input type="checkbox" [(ngModel)]="confirmed" [disabled]="busy()" /> Je confirme les
          scores finaux et le règlement des tickets.</label
        >
        <button (click)="apply()" [disabled]="busy() || !confirmed">Valider tout le lot</button>
      }
      <h2>Sauvegarde chiffrée hors serveur</h2>
      <p>
        {{ s.backup.configured ? 'Stockage configuré' : 'Stockage distant non configuré' }} ·
        Dernier succès : {{ s.backup.lastSuccess || 'aucun succès constaté' }}
      </p>
      @if (s.backup.lastError) {
        <p role="alert">{{ s.backup.lastError }}</p>
      }
      <button (click)="backup()" [disabled]="busy() || !s.backup.configured">
        Créer et transférer une sauvegarde
      </button>
      <h2>Supervision</h2>
      <p>
        {{ s.metrics.requests }} requêtes · {{ s.metrics.serverErrors }} erreurs · p95 :
        {{ s.metrics.p95Ms }} ms
      </p>
      <h2>Journal administratif</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date UTC</th>
              <th>Action</th>
              <th>Cible</th>
            </tr>
          </thead>
          <tbody>
            @for (a of s.audit; track $index) {
              <tr>
                <td>{{ a.createdAt }}</td>
                <td>{{ a.action }}</td>
                <td>{{ a.targetId }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
        max-width: 1100px;
        margin: auto;
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
      }
      button {
        margin: 10px 12px 10px 0;
        padding: 12px;
      }
      label {
        display: block;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      th,
      td {
        padding: 12px;
        border-bottom: 1px solid var(--bv-border);
      }
      .table-wrap {
        overflow: auto;
      }
      code {
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class OperationsComponent {
  private http = inject(HttpClient);
  summary = signal<Summary | null>(null);
  busy = signal(false);
  error = signal('');
  receipt = signal<{ id: string; rows: ResultRow[] } | null>(null);
  input = '';
  confirmed = false;
  constructor() {
    void this.load();
  }
  private async work(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (e) {
      this.error.set(
        e instanceof HttpErrorResponse
          ? e.error?.message ||
              'Action refusée. Vérifiez votre session et la double authentification.'
          : 'Format invalide. Utilisez identifiant;score;score.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  async load() {
    await this.work(async () => {
      this.summary.set(await firstValueFrom(this.http.get<Summary>('/api/admin/operations')));
    });
  }
  async preview() {
    await this.work(async () => {
      this.receipt.set(null);
      this.confirmed = false;
      const rows = this.input
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const values = line.split(';').map((s) => s.trim());
          if (values.length !== 3 || !/^\d{1,3}$/.test(values[1]) || !/^\d{1,3}$/.test(values[2]))
            throw Error();
          return { matchId: values[0], homeScore: Number(values[1]), awayScore: Number(values[2]) };
        });
      this.receipt.set(
        await firstValueFrom(
          this.http.post<{ id: string; rows: ResultRow[] }>(
            '/api/admin/operations/results/preview',
            { rows },
          ),
        ),
      );
    });
  }
  async apply() {
    if (!this.confirmed || !this.receipt()) return;
    await this.work(async () => {
      await firstValueFrom(
        this.http.post('/api/admin/operations/results/apply', {
          id: this.receipt()!.id,
          confirmation: 'REGLER',
        }),
      );
      this.receipt.set(null);
      this.input = '';
      this.confirmed = false;
      this.summary.set(await firstValueFrom(this.http.get<Summary>('/api/admin/operations')));
    });
  }
  async backup() {
    await this.work(async () => {
      await firstValueFrom(
        this.http.post('/api/admin/operations/backup', { confirmation: 'SAUVEGARDER' }),
      );
      this.summary.set(await firstValueFrom(this.http.get<Summary>('/api/admin/operations')));
    });
  }
}
