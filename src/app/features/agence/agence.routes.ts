import { Routes } from '@angular/router';
import { AgenceComponent } from './agence';

const routes: Routes = [
  {
    path: '',
    component: AgenceComponent,
  },
  {
    path: 'archives',
    loadComponent: () =>
      import('./archives/archives.component').then(
        (m) => m.AgenceArchivesComponent
      ),
  },
  {
    path: 'trophees',
    loadComponent: () =>
      import('./trophees/trophees.component').then(
        (m) => m.AgenceTropheesComponent
      ),
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
    path: 'liste',
    loadComponent: () =>
      import('./liste/liste.component').then(
        (m) => m.AgenceListeComponent
      ),
  },
];

export default routes;
