import { Component, OnInit, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
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
type SyncMode = 'odds' | 'scores' | 'global';

interface OddsState {
  scores?: {
    externalId: string;
    sportKey: string;
    competition: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    reason: string;
    fetchedAt: number;
  }[];
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
  batchResults?: {
    competition: string;
    kind?: string;
    cost?: number;
    status: string;
    message?: string;
    applied?: number;
    skipped?: { homeTeam: string; awayTeam: string; reason: string }[];
  }[];
}

@Component({
  selector: 'admin-odds-import',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
  readonly mfaRequired = signal(false);
  readonly selectedCompetitions = signal<string[]>([]);
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
        this.busy.set(false);
        if (this.mfaRequired()) this.message.set('');
        this.mfaRequired.set(false);
      },
      error: (error) =>
        this.showError(error, 'Impossible de lire les données locales de The Odds API.'),
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
  scoreCompetitionCount() {
    return this.selectedCompetitions().filter((key) =>
      this.majorLeagues.some((league) => league.key === key),
    ).length;
  }
  visibleScores() {
    const keys = this.selectedCompetitions();
    return (this.state()?.scores || []).filter(
      (row) => !keys.length || keys.includes(row.sportKey),
    );
  }
  canSync(mode: SyncMode) {
    if (this.busy() || !this.state()?.usage.configured || !this.selectedCompetitions().length)
      return false;
    if (mode === 'scores') return this.scoreCompetitionCount() > 0;
    return this.date >= this.minDate && this.date <= this.maxDate;
  }
  sync(mode: SyncMode) {
    if (!this.canSync(mode)) return;
    const body = {
      mode,
      competitions: this.selectedCompetitions(),
      date: mode === 'scores' ? new Date().toISOString().slice(0, 10) : this.date,
      bookmaker: this.bookmaker,
      consent: true,
    };
    this.busy.set(true);
    this.batchResults.set([]);
    this.message.set('Actualisation en cours…');
    this.http
      .post<OddsState>(`${this.url}/sync`, body, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      .subscribe({
        next: (data) => {
          this.state.set(data);
          this.busy.set(false);
          const results = data.batchResults || [];
          this.batchResults.set(results);
          const count = (kind: string) =>
            results.reduce((sum, row) => sum + (row.kind === kind ? row.applied || 0 : 0), 0);
          const published = count('odds');
          const settled = count('scores');
          const summary = [];
          if (mode !== 'scores') summary.push(`${published} match(s) publié(s) ou mis à jour.`);
          if (mode !== 'odds') summary.push(`${settled} résultat(s) réglé(s).`);
          if (results.some((row) => row.status === 'FAILED' || row.skipped?.length))
            summary.push('Consultez le bilan pour les données qui demandent une vérification.');
          this.message.set(summary.join(' '));
          if (published || settled) this.imported.emit();
        },
        error: (error) => this.showError(error, 'Échec de l’actualisation.'),
      });
  }
  private showError(error: HttpErrorResponse, fallback: string) {
    this.busy.set(false);
    const blocked = error.status === 403 && error.error?.code === 'ADMIN_MFA_REQUIRED';
    this.mfaRequired.set(blocked);
    if (blocked) this.state.set(null);
    this.message.set(typeof error.error?.message === 'string' ? error.error.message : fallback);
  }
}
