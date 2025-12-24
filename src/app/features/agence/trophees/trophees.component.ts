import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-agence-trophees',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './trophees.component.html',
  styleUrl: './trophees.component.css',
})
export class AgenceTropheesComponent {}
