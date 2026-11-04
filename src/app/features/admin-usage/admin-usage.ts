import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-admin-usage',
  standalone: true,
  imports: [RouterLink],
  template: ` <section style="padding:2rem;color:#e2e8f0">
    <h1>Catalogue des rencontres</h1>
    <p>
      La V1 utilise un catalogue géré par les administrateurs. Aucune donnée sportive en direct
      n’est simulée.
    </p>
    <p>
      Créez les rencontres et leurs cotes avant leur début, puis saisissez les scores officiels pour
      régler les paris.
    </p>
    <a routerLink="/admin/matches">Gérer les rencontres</a>
  </section>`,
})
export class AdminUsageComponent {}
