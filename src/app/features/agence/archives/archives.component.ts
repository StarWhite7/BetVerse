import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-agence-archives',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './archives.component.html',
  styleUrl: './archives.component.css',
})
export class AgenceArchivesComponent {}
