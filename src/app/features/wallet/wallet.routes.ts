import { Routes } from '@angular/router';
import { WalletComponent } from './wallet';
import { WalletHistoryComponent } from './history/history.component';

const routes: Routes = [
  {
    path: '',
    component: WalletComponent,
  },
  {
    path: 'history',
    component: WalletHistoryComponent,
  },
];

export default routes;
