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
    children: [
      {
        path: '',
        loadChildren: () =>
          import('./features/home/home.routes').then((m) => m.default),
      },
      {
        path: 'wallet',
        loadChildren: () =>
          import('./features/wallet/wallet.routes').then((m) => m.default),
      },
      {
        path: 'matches',
        loadChildren: () =>
          import('./features/matches/matches.routes').then((m) => m.default),
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
        canActivate: [authGuard, roleGuard(['USER'])],
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
    canActivate: [authGuard, roleGuard(['ADMIN', 'SUPERADMIN'])]
  },
  {
    path: '**',
    redirectTo: '',
  }
];
