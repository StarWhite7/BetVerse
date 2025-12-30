import { Routes } from '@angular/router';
import { AgenceComponent } from './agence';
import { MatchDeClanComponent } from '../matchdeclan/matchdeclan.component';

const routes: Routes = [
  {
    path: '',
    component: AgenceComponent,
  },
  {
    path: 'coordination',
    loadComponent: () =>
      import('./coordination/coordination.component').then(
        (m) => m.AgenceCoordinationComponent
      ),
  },
  {
    path: 'atelier',
    loadComponent: () =>
      import('./atelier/atelier.component').then(
        (m) => m.AgenceAtelierComponent
      ),
  },
  {
    path: 'bureau',
    loadComponent: () =>
      import('./bureau/bureau.component').then(
        (m) => m.AgenceBureauComponent
      ),
  },
  {
    path: 'matchdeclan',
    component: MatchDeClanComponent,
  },
  {
    path: 'liste',
    loadComponent: () =>
      import('./liste/liste.component').then(
        (m) => m.AgenceListeComponent
      ),
  },
  {
    path: 'classementdesagences',
    loadComponent: () =>
      import('../classementdesagences/classementdesagences.component').then(
        (m) => m.ClassementDesAgencesComponent
      ),
  },
];

export default routes;
