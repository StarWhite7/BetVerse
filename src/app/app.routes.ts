import { Routes } from '@angular/router';
import { MainComponent } from './features/home/main/main.component';



export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/home/home.routes'),
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes'),
  },
  {
    path: 'bets',
    loadChildren: () => import('./features/bets/bets.routes'),
    canActivate: [authGuard, roleGuard(['user'])]
  },
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes'),
    canActivate: [authGuard, roleGuard(['admin', 'superadmin'])]
  },
  {
    path: '**',
    redirectTo: '',
  }
];