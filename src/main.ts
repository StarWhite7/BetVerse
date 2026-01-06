import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => {
    if (typeof ngDevMode !== 'undefined' && ngDevMode) {
      console.error(err);
    }
  });
