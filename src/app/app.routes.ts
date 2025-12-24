import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { MainLayout } from './core/layout/main-layout/main-layout';
import { AuthLayout } from './core/layout/auth-layout/auth-layout';
import { AdminLayout } from './core/layout/admin-layout/admin-layout';

export const routes: Routes = [
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadChildren: () =>
          import('./features/matches/matches.routes').then((m) => m.default),
      },
      {
        path: 'matches',
        pathMatch: 'full',
        redirectTo: '',
      },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/home/home.routes').then((m) => m.default),
      },
      {
        path: 'wallet',
        loadChildren: () =>
          import('./features/wallet/wallet.routes').then((m) => m.default),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'leaderboard',
        loadChildren: () =>
          import('./features/leaderboard/leaderboard.routes').then((m) => m.default),
      },
      {
        path: 'users/:id',
        loadComponent: () =>
          import('./features/users/public-profile/public-profile').then((m) => m.PublicProfileComponent),
      },
      {
        path: 'admin-usage',
        loadChildren: () =>
          import('./features/admin-usage/admin-usage.routes').then((m) => m.default),
        canActivate: [roleGuard(['ADMIN'])],
      },
      {
        path: 'profile',
        canActivate: [authGuard],
        loadChildren: () =>
          import('./features/profile/profile.routes').then((m) => m.default),
      },
      {
        path: 'bets',
        loadChildren: () =>
          import('./features/bets/bets.routes').then((m) => m.default),
        canActivate: [authGuard, roleGuard(['USER', 'ADMIN'])],
      },
      {
        path: 'shards',
        loadComponent: () =>
          import('./features/shards/shards.component').then(
            (m) => m.ShardsComponent
          ),
      },
            {
        path: 'agence',
        loadChildren: () =>
          import('./features/agence/agence.routes').then((m) => m.default),
      },

      {
        path: 'classement',
        pathMatch: 'full',
        redirectTo: 'leaderboard',
      },
    ],
  },
  {
    path: 'auth',
    component: AuthLayout,
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.default),
  },
  {
    path: 'admin',
    component: AdminLayout,
    loadChildren: () =>
      import('./features/admin/admin.routes').then((m) => m.default),
    canActivate: [authGuard, roleGuard(['ADMIN'])]
  },
  {
    path: '**',
    redirectTo: '',
  }
];


