import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MatchesApiService,
  MatchEntity,
  MatchResult,
  MatchStatus,
} from '../../../data-access/matches/matches.api';
import { NotificationService } from '../../../core/services/notification.service';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/directives/dialog.directive';

type FilterValue = MatchStatus | 'ALL';

@Component({
  selector: 'admin-matches',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DialogDirective],
  templateUrl: './matches.component.html',
  styleUrl: './matches.component.css',
})
export class MatchesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly matchesApi = inject(MatchesApiService);
  private readonly notifications = inject(NotificationService);

  filters: { label: string; value: FilterValue }[] = [
    { label: 'Tous', value: 'ALL' },
    { label: 'A venir', value: 'UPCOMING' },
    { label: 'En cours', value: 'LIVE' },
    { label: 'Termines', value: 'FINISHED' },
    { label: 'Annulés', value: 'CANCELLED' },
  ];

  matches = signal<MatchEntity[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  statusFilter = signal<FilterValue>('UPCOMING');
  submitting = signal(false);
  finishModalOpen = signal(false);
  finishTarget = signal<MatchEntity | null>(null);
  finishResult = signal<MatchResult>('HOME');
  finishSubmitting = signal(false);
  homeScore = 0;
  awayScore = 0;
  cancelMode = signal(false);
  cancellationReason = '';

  readonly matchForm = this.fb.group({
    id: [''],
    homeTeam: ['', [Validators.required]],
    awayTeam: ['', [Validators.required]],
    startDate: ['', [Validators.required]],
    sportKey: ['football', [Validators.required]],
    competition: ['Catalogue BetVerse', [Validators.required, Validators.maxLength(80)]],
    oddsHome: [1.5, [Validators.required, Validators.min(1)]],
    oddsAway: [1.5, [Validators.required, Validators.min(1)]],
    oddsDraw: [null as number | null, [Validators.min(1)]],
  });

  ngOnInit() {
    this.loadMatches();
  }

  loadMatches() {
    this.loading.set(true);
    this.error.set(null);
    const filter = this.statusFilter();
    const status = filter === 'ALL' ? undefined : (filter as MatchStatus);
    this.matchesApi.getMatches(status).subscribe({
      next: (matches) => {
        this.matches.set(matches);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les matchs.');
        this.loading.set(false);
      },
    });
  }

  applyFilter(filter: FilterValue) {
    if (this.statusFilter() === filter) return;
    this.statusFilter.set(filter);
    this.loadMatches();
  }

  selectMatch(match: MatchEntity) {
    this.matchForm.patchValue({
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      startDate: this.toDatetimeInput(match.startDate),
      sportKey: match.sportKey ?? 'football',
      competition: match.competition ?? 'Catalogue BetVerse',
      oddsHome: match.oddsHome,
      oddsAway: match.oddsAway,
      oddsDraw: match.oddsDraw ?? null,
    });
  }

  resetForm() {
    this.matchForm.reset({
      id: '',
      homeTeam: '',
      awayTeam: '',
      startDate: '',
      sportKey: 'football',
      competition: 'Catalogue BetVerse',
      oddsHome: 1.5,
      oddsAway: 1.5,
      oddsDraw: null,
    });
  }

  submitMatch() {
    if (this.matchForm.invalid || this.submitting()) {
      this.matchForm.markAllAsTouched();
      return;
    }

    const raw = this.matchForm.getRawValue();
    const payload = {
      homeTeam: raw.homeTeam!,
      awayTeam: raw.awayTeam!,
      startDate: new Date(raw.startDate as string).toISOString(),
      oddsHome: Number(raw.oddsHome),
      oddsAway: Number(raw.oddsAway),
      oddsDraw: raw.oddsDraw ? Number(raw.oddsDraw) : null,
      sportKey: raw.sportKey!,
      sportTitle:
        (
          { football: 'Football', tennis: 'Tennis', basketball: 'Basketball' } as Record<
            string,
            string
          >
        )[raw.sportKey!] ?? 'Football',
      competition: raw.competition!.trim(),
    };

    this.submitting.set(true);
    const isEdit = !!raw.id;
    const request = isEdit
      ? this.matchesApi.updateMatch(raw.id!, payload)
      : this.matchesApi.createMatch(payload);

    request.subscribe({
      next: () => {
        this.submitting.set(false);
        this.notifications.success(isEdit ? 'Match mis a jour.' : 'Match cree.');
        this.resetForm();
        this.loadMatches();
      },
      error: (err) => {
        this.submitting.set(false);
        const message = err?.error?.message ?? 'Opération impossible.';
        this.notifications.error(message);
      },
    });
  }

  openFinishModal(match: MatchEntity) {
    this.cancelMode.set(false);
    this.homeScore = 0;
    this.awayScore = 0;
    this.finishTarget.set(match);
    this.finishResult.set('HOME');
    this.finishModalOpen.set(true);
  }

  closeFinishModal() {
    if (this.finishSubmitting()) return;
    this.finishModalOpen.set(false);
  }
  openCancelModal(match: MatchEntity) {
    this.openFinishModal(match);
    this.cancelMode.set(true);
    this.cancellationReason = '';
  }

  finishMatch() {
    const target = this.finishTarget();
    if (!target) return;
    this.finishSubmitting.set(true);
    const result =
      this.homeScore === this.awayScore
        ? 'DRAW'
        : this.homeScore > this.awayScore
          ? 'HOME'
          : 'AWAY';
    const request = this.cancelMode()
      ? this.matchesApi.cancelMatch(target.id, this.cancellationReason.trim())
      : this.matchesApi.finishMatch(target.id, result, this.homeScore, this.awayScore);
    request.subscribe({
      next: () => {
        this.finishSubmitting.set(false);
        this.finishModalOpen.set(false);
        this.notifications.success(
          this.cancelMode()
            ? 'Match annulé. Toutes les mises ont été remboursées.'
            : 'Match clôturé.',
        );
        this.loadMatches();
      },
      error: (err) => {
        this.finishSubmitting.set(false);
        const message = err?.error?.message ?? 'Impossible de clore le match.';
        this.notifications.error(message);
      },
    });
  }

  updateFinishResult(event: Event) {
    const value = (event.target as HTMLSelectElement | null)?.value ?? 'HOME';
    this.finishResult.set(value as MatchResult);
  }

  trackByMatch(_index: number, match: MatchEntity) {
    return match.id;
  }

  private toDatetimeInput(date: string) {
    const d = new Date(date);
    const pad = (value: number) => value.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
