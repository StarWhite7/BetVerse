import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

const AGENCY_STORAGE_KEY = 'betverse-has-agence';
const AGENCY_CREATE_COST = 100;

@Component({
  selector: 'app-agence',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './agence.html',
  styleUrl: './agence.css',
})
export class AgenceComponent implements OnInit {
  hasAgency = signal(false);
  shards = signal(140);

  ngOnInit() {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const stored = localStorage.getItem(AGENCY_STORAGE_KEY);
    if (stored === 'true') {
      this.hasAgency.set(true);
    }
  }

  createAgency() {
    if (this.shards() < AGENCY_CREATE_COST) {
      return;
    }
    this.shards.update((value) => value - AGENCY_CREATE_COST);
    this.hasAgency.set(true);
    localStorage.setItem(AGENCY_STORAGE_KEY, 'true');
  }

  agencyCost() {
    return AGENCY_CREATE_COST;
  }
}
