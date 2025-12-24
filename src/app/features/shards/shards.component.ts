import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-shards',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './shards.component.html',
  styleUrl: './shards.component.css',
})
export class ShardsComponent {}
