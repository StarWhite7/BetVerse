import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-match-de-clan',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './matchdeclan.component.html',
  styleUrl: './matchdeclan.component.css',
})
export class MatchDeClanComponent {}
