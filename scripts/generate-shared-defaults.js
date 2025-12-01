// scripts/generate-shared-defaults.js
// Run: node scripts/generate-shared-defaults.js

const fs = require("fs");
const path = require("path");

function createFile(filePath, content = "") {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, content, "utf8");
    console.log("📄 Created:", filePath);
  }
}

function createDir(dir) {
  const full = path.join(process.cwd(), dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
    console.log("📁 Created:", dir);
  }
}

// PATHS
const BASE = "src/app/shared";
const UI_BASE = "src/app/ui";

// ————————————————————————————————————————
// SHARED / DIRECTIVES
// ————————————————————————————————————————
createDir(`${BASE}/directives`);
createFile(
  `${BASE}/directives/autofocus.directive.ts`,
  `import { Directive, ElementRef } from '@angular/core';

@Directive({
  selector: '[sharedAutofocus]'
})
export class AutofocusDirective {
  constructor(private el: ElementRef) {
    setTimeout(() => this.el.nativeElement.focus(), 0);
  }
}`
);

// ————————————————————————————————————————
// SHARED / MODELS
// ————————————————————————————————————————
createDir(`${BASE}/models`);
createFile(
  `${BASE}/models/user.model.ts`,
  `export type UserRole = 'user' | 'admin' | 'superadmin';

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}`
);

createFile(
  `${BASE}/models/api-response.model.ts`,
  `export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}`
);

// ————————————————————————————————————————
// SHARED / PIPES
// ————————————————————————————————————————
createDir(`${BASE}/pipes`);
createFile(
  `${BASE}/pipes/capitalize.pipe.ts`,
  `import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'capitalize' })
export class CapitalizePipe implements PipeTransform {
  transform(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }
}`
);

// ————————————————————————————————————————
// SHARED / UI (design system)
// ————————————————————————————————————————
createDir(`${BASE}/ui`);
createFile(
  `${BASE}/ui/button.component.ts`,
  `import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-button',
  template: '<button class="px-4 py-2 rounded bg-primary text-white"><ng-content></ng-content></button>'
})
export class UIButtonComponent {
  @Input() variant: 'primary' | 'secondary' = 'primary';
}`
);

createFile(
  `${BASE}/ui/card.component.ts`,
  `import { Component } from '@angular/core';

@Component({
  selector: 'ui-card',
  template: '<div class="p-4 rounded shadow bg-white"><ng-content></ng-content></div>'
})
export class UICardComponent {}`
);

// ————————————————————————————————————————
// SHARED / UTILS
// ————————————————————————————————————————
createDir(`${BASE}/utils`);
createFile(
  `${BASE}/utils/date.util.ts`,
  `export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}`
);

// ————————————————————————————————————————
// SHARED / VALIDATORS
// ————————————————————————————————————————
createDir(`${BASE}/validators`);
createFile(
  `${BASE}/validators/email.validator.ts`,
  `export function isValidEmail(email: string): boolean {
  return /^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$/.test(email);
}`
);

// ————————————————————————————————————————
// UI FOLDER (GLOBAL UI COMPONENTS)
// ————————————————————————————————————————
createDir(`${UI_BASE}/modals`);
createFile(
  `${UI_BASE}/modals/base-modal.component.ts`,
  `import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-base-modal',
  template: '<div class="modal"><ng-content></ng-content></div>'
})
export class BaseModalComponent {
  @Input() open = false;
}`
);

createDir(`${UI_BASE}/drawers`);
createFile(
  `${UI_BASE}/drawers/base-drawer.component.ts`,
  `import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-base-drawer',
  template: '<div class="drawer"><ng-content></ng-content></div>'
})
export class BaseDrawerComponent {
  @Input() open = false;
}`
);

console.log("\n✨ Shared + UI default files generated successfully!");
