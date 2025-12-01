import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('BetVerse');

  progress = 0;

  constructor() {
    this.startLoading();
  }

  startLoading() {
    const interval = setInterval(() => {
      if (this.progress < 100) {
        this.progress++;
      } else {
        clearInterval(interval);
      }
    }, 25920000); // durée du remplissage (40ms = ~4s total)
  }
}

