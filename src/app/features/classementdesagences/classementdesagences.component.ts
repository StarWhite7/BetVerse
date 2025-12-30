import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-classement-des-agences',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './classementdesagences.component.html',
  styleUrl: './classementdesagences.component.css',
})
export class ClassementDesAgencesComponent {}
