import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { Capacitor } from '@capacitor/core';
import { configureMobileApi } from './app/core/config/environment';

async function start() {
  if (Capacitor.isNativePlatform()) {
    const response = await fetch('/mobile-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuration mobile absente.');
    const config = await response.json();
    configureMobileApi(config.origin);
  }
  await bootstrapApplication(App, appConfig);
}

start().catch((err) => {
  const root = document.querySelector('app-root');
  if (root)
    root.textContent =
      'Impossible de démarrer BetVerse. Fermez puis relancez l’application. Si le problème persiste, installez la dernière version de test.';
  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    console.error(err);
  }
});
