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
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  startDate: string;
  quotes: Quote[];
  fetchedAt: number;
  snapshotId: string;
  matchId: string | null;
  current?: {
    homeTeam: string;
    awayTeam: string;
    startDate: string;
    status: string;
    home: number;
    draw: number | null;
    away: number;
    hasBets: boolean;
  } | null;
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
  batchResults?: { competition: string; status: string; message?: string }[];
  publishedCount?: number;
}

@Component({
  selector: 'admin-odds-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './odds-import.component.html',
  styleUrl: './odds-import.component.css',
})
export class OddsImportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/odds`;
  readonly imported = output<void>();
  readonly state = signal<OddsState | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly selectedCompetitions = signal<string[]>([]);
  readonly selectedRows = signal<string[]>([]);
  readonly batchResults = signal<NonNullable<OddsState['batchResults']>>([]);
  readonly majorLeagues = [
    { key: 'soccer_france_ligue_one', label: 'Ligue 1', country: 'France' },
    { key: 'soccer_epl', label: 'Premier League', country: 'Angleterre' },
    { key: 'soccer_spain_la_liga', label: 'La Liga', country: 'Espagne' },
    { key: 'soccer_italy_serie_a', label: 'Serie A', country: 'Italie' },
    { key: 'soccer_germany_bundesliga', label: 'Bundesliga', country: 'Allemagne' },
  ];
  readonly minDate = new Date().toISOString().slice(0, 10);
  readonly maxDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  accepted = false;
  date = this.minDate;
  bookmaker = 'winamax_fr';
  ngOnInit() {
    this.read();
  }
  read() {
    if (this.busy()) return;
    this.busy.set(true);
    this.http.get<OddsState>(this.url).subscribe({
      next: (data) => {
        this.state.set(data);
        this.selectedRows.set([]);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.message.set('Impossible de lire les données locales de The Odds API.');
      },
    });
  }
  extraCompetitions() {
    return Object.entries(this.state()?.competitions || {}).filter(
      ([key]) => !this.majorLeagues.some((entry) => entry.key === key),
    );
  }
  toggleCompetition(key: string, checked: boolean) {
    if (this.busy()) return;
    this.selectedCompetitions.update((keys) =>
      checked ? [...new Set([...keys, key])] : keys.filter((value) => value !== key),
    );
    this.accepted = false;
    this.selectedRows.set([]);
    this.batchResults.set([]);
  }
  resetConsent() {
    this.accepted = false;
    this.selectedRows.set([]);
  }
  visibleFixtures() {
    const keys = this.selectedCompetitions();
    const from = Date.parse(`${this.date}T00:00:00Z`);
    return (this.state()?.fixtures || []).filter(
      (fixture) =>
        (!keys.length || keys.includes(fixture.sportKey)) &&
        Date.parse(fixture.startDate) >= from &&
        Date.parse(fixture.startDate) < from + 7 * 86400000,
    );
  }
  quote(fixture: OddsFixture) {
    return fixture.quotes.find((q) => q.bookmaker === this.bookmaker);
  }
  change(fixture: OddsFixture): string {
    const quote = this.quote(fixture),
      current = fixture.current;
    if (!quote) return 'Cotes absentes';
    if (Date.parse(fixture.startDate) <= Date.now()) return 'Commencé';
    if (fixture.fetchedAt <= Date.now() - 3600000 || quote.updatedAt <= Date.now() - 3600000)
      return 'Aperçu expiré';
    if (!current) return 'À ajouter';
    if (current.status !== 'UPCOMING' || Date.parse(current.startDate) <= Date.now())
      return 'Match verrouillé';
    const identityChanged =
      current.homeTeam !== fixture.homeTeam ||
      current.awayTeam !== fixture.awayTeam ||
      current.startDate !== fixture.startDate;
    if (identityChanged && current.hasBets) return 'Conflit : paris existants';
    if (identityChanged) return 'Calendrier modifié';
    return current.home === quote.home && current.draw === quote.draw && current.away === quote.away
      ? 'Inchangé'
      : 'Cotes modifiées';
  }
  canPublish(fixture: OddsFixture) {
    return ['À ajouter', 'Calendrier modifié', 'Cotes modifiées'].includes(this.change(fixture));
  }
  eligibleRows() {
    return this.visibleFixtures().filter((fixture) => this.canPublish(fixture));
  }
  selectedFixtures() {
    return this.eligibleRows().filter((fixture) =>
      this.selectedRows().includes(fixture.externalId),
    );
  }
  allSelected() {
    const rows = this.eligibleRows();
    return (
      !!rows.length && rows.every((fixture) => this.selectedRows().includes(fixture.externalId))
    );
  }
  toggleAll(checked: boolean) {
    if (!this.busy())
      this.selectedRows.set(
        checked
          ? this.eligibleRows()
              .slice(0, 200)
              .map((fixture) => fixture.externalId)
          : [],
      );
  }
  toggleRow(id: string, checked: boolean) {
    if (this.busy()) return;
    this.selectedRows.update((ids) =>
      checked ? [...new Set([...ids, id])].slice(0, 200) : ids.filter((value) => value !== id),
    );
  }
  preview() {
    const competitions = this.selectedCompetitions();
    if (
      this.busy() ||
      !this.accepted ||
      !this.state()?.usage.configured ||
      !competitions.length ||
      competitions.length > 5
    )
      return;
    this.accepted = false;
    this.selectedRows.set([]);
    this.run('preview-batch', { competitions, date: this.date, consent: true });
  }
  publishSelected() {
    if (this.busy()) return;
    const fixtures = this.selectedFixtures().map((fixture) => ({
      eventId: fixture.externalId,
      bookmaker: this.bookmaker,
      snapshotId: fixture.snapshotId,
    }));
    if (fixtures.length) this.run('publish-batch', { fixtures });
  }
  private run(action: 'preview-batch' | 'publish-batch', body: object) {
    this.busy.set(true);
    this.message.set(
      action === 'preview-batch'
        ? 'Chargement des championnats sélectionnés…'
        : 'Validation de la sélection…',
    );
    this.http
      .post<OddsState>(`${this.url}/${action}`, body, {
        headers: action === 'preview-batch' ? { 'Idempotency-Key': crypto.randomUUID() } : {},
      })
      .subscribe({
        next: (data) => {
          this.state.set(data);
          this.busy.set(false);
          this.selectedRows.set([]);
          if (action === 'preview-batch') {
            this.batchResults.set(data.batchResults || []);
            const loaded = (data.batchResults || [])
              .filter((row) => ['LOADED', 'CACHED'].includes(row.status))
              .map((row) => row.competition);
            this.selectedRows.set(
              this.eligibleRows()
                .filter((row) => loaded.includes(row.sportKey))
                .slice(0, 200)
                .map((row) => row.externalId),
            );
            const failures = (data.batchResults || []).some((row) => row.status === 'FAILED');
            const calls = (data.batchResults || []).filter((row) => row.status === 'LOADED').length;
            this.message.set(
              failures
                ? 'Chargement partiel : arrêt au premier échec, sans relance. Vérifiez le bilan ci-dessus.'
                : `${calls} appel(s) fournisseur ; les autres données proviennent du cache. Les modifications disponibles sont sélectionnées pour validation.`,
            );
          } else {
            this.message.set(
              `${data.publishedCount || 0} match(s) validé(s) ensemble : aucun crédit consommé.`,
            );
            this.imported.emit();
          }
        },
        error: (error) => {
          this.busy.set(false);
          this.selectedRows.set([]);
          this.message.set(error?.error?.message ?? 'Échec. Aucune relance automatique.');
          this.read();
        },
      });
  }
}
