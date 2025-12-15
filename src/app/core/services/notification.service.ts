import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private counter = 0;
  toasts = signal<Toast[]>([]);

  success(message: string) {
    this.addToast(message, 'success');
  }

  error(message: string) {
    this.addToast(message, 'error');
  }

  private addToast(message: string, type: 'success' | 'error') {
    const toast: Toast = { id: ++this.counter, message, type };
    this.toasts.update((current) => [...current, toast]);
    setTimeout(() => this.removeToast(toast.id), 4000);
  }

  private removeToast(id: number) {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }
}
