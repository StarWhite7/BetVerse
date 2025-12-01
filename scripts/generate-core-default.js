// scripts/generate-core-defaults.js
// Run: node scripts/generate-core-defaults.js

const fs = require('fs');
const path = require('path');

function createFile(filePath, content = '') {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('📄 Created:', filePath);
  }
}

function ensureCoreFiles() {

  //
  // core/config
  //
  createFile(
    'src/app/core/config/app.config.ts',
    `export const APP_CONFIG = {
  appName: 'BetVerse',
  version: '1.0.0'
};`
  );

  createFile(
    'src/app/core/config/endpoints.config.ts',
    `export const API_ENDPOINTS = {
  matches: '/api/matches',
  bets: '/api/bets',
  users: '/api/users'
};`
  );

  //
  // core/i18n
  //
  createFile('src/app/core/i18n/i18n.init.ts', `export function initI18n() {// ...}`);
  createFile('src/app/core/i18n/fr.json', `{ "hello": "Bonjour" }`);
  createFile('src/app/core/i18n/en.json', `{ "hello": "Hello" }`);

  //
  // core/interceptors
  //
  createFile(
    'src/app/core/interceptors/auth.interceptor.ts',
    `import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Add Auth headers
  return next(req);
};`
  );

  createFile(
    'src/app/core/interceptors/error.interceptor.ts',
    `import { HttpInterceptorFn } from '@angular/common/http';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe();
};`
  );

  //
  // core/layout
  //
  createFile(
    'src/app/core/layout/main-layout.component.ts',
    `import { Component } from '@angular/core';

@Component({
  selector: 'core-main-layout',
  template: '<router-outlet></router-outlet>',
})
export class MainLayoutComponent {}`
  );

  //
  // core/services
  //
  createFile(
    'src/app/core/services/auth.service.ts',
    `import { Injectable } from '@angular/core';
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
}`
  );

  createFile(
    'src/app/core/services/theme.service.ts',
    `import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  toggleDarkMode() { /* ... */ }
}`
  );

  //
  // core/sockets
  //
  createFile(
    'src/app/core/sockets/socket.service.ts',
    `import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SocketService {
  connect() { /* ... */ }
}`
  );

  //
  // core/animations
  //
  createFile(
    'src/app/core/animations/anim.helpers.ts',
    `// GSAP animation helpers
export function fadeIn(el: HTMLElement) { /* ... */ }`
  );
}

ensureCoreFiles();

console.log('\n✨ Default core files generated successfully!');
