import { Injectable } from '@angular/core';
import { User } from '../../shared/models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user: User | null = null;

  currentUser() {
    return this._user;
  }

  setUser(u: User) {
    this._user = u;
  }
}