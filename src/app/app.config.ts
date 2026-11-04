import {
  ApplicationConfig,
  APP_INITIALIZER,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { inject } from '@angular/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/http-error.interceptor';
import { nativeHttpInterceptor } from './core/interceptors/native-http.interceptor';
import { AuthService } from './core/services/auth.service';
import { firstValueFrom } from 'rxjs';

const initAuth = (auth: AuthService) => () => firstValueFrom(auth.initialize());

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withNavigationErrorHandler(() => {
        inject(AuthService).startupError.set(
          'Impossible d’ouvrir cette page. Une mise à jour peut être disponible : rechargez l’application.',
        );
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, nativeHttpInterceptor])),
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [AuthService],
      useFactory: initAuth,
    },
  ],
};
