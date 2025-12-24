import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-agence-atelier',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './atelier.component.html',
  styleUrl: './atelier.component.css',
})
export class AgenceAtelierComponent {}
