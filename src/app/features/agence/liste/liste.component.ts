import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-agence-liste',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './liste.component.html',
  styleUrl: './liste.component.css',
})
export class AgenceListeComponent {}
