import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { MatchesComponent } from './matches/matches.component';
import { BetsComponent } from './bets/bets.component';
import { UsersComponent } from './users/users.component';

const routes: Routes = [
  {path:'operations',loadComponent:()=>import('./operations/operations.component').then(m=>m.OperationsComponent)},
  {path:'security',loadComponent:()=>import('./security/security.component').then(m=>m.SecurityComponent)},
  {
    path: '',
    component: DashboardComponent,
  },
  {
    path: 'matches',
    component: MatchesComponent,
  },
  {
    path: 'bets',
    component: BetsComponent,
  },
  {
    path: 'users',
    component: UsersComponent,
  },
];

export default routes;
