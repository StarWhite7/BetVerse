import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-agence-bureau',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './bureau.component.html',
  styleUrl: './bureau.component.css',
})
export class AgenceBureauComponent {}
