import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-agence-coordination',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './coordination.component.html',
  styleUrl: './coordination.component.css',
})
export class AgenceCoordinationComponent {}
