import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {}
