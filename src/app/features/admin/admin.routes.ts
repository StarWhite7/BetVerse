import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { MatchesComponent } from './matches/matches.component';
import { BetsComponent } from './bets/bets.component';

const routes: Routes = [
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
];

export default routes;
