import { Injectable, signal } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<'system' | 'light' | 'dark'>('system');
  readonly dark = signal(false);
  private readonly media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  constructor() {
    try {
      const value = localStorage.getItem('betverse_theme');
      if (value === 'light' || value === 'dark') this.mode.set(value);
    } catch {}
    this.apply();
    this.media?.addEventListener('change', () => this.apply());
  }
  set(value: string) {
    if (value !== 'system' && value !== 'light' && value !== 'dark') return;
    this.mode.set(value);
    try {
      localStorage.setItem('betverse_theme', value);
    } catch {}
    this.apply();
  }
  private apply() {
    this.dark.set(this.mode() === 'dark' || (this.mode() === 'system' && !!this.media?.matches));
    document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
  }
}
