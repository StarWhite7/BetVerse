import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  output,
} from '@angular/core';

@Directive({ selector: '[bvDialog]', standalone: true })
export class DialogDirective implements AfterViewInit, OnDestroy {
  @HostBinding('attr.role') role = 'dialog';
  @HostBinding('attr.aria-modal') modal = 'true';
  @HostBinding('attr.tabindex') tabIndex = -1;
  readonly dialogDismiss = output<void>();
  private previous = document.activeElement as HTMLElement | null;
  constructor(private readonly element: ElementRef<HTMLElement>) {}
  ngAfterViewInit() {
    queueMicrotask(() => {
      const element = this.element.nativeElement;
      if (!element.isConnected) return;
      if (element instanceof HTMLDialogElement && !element.open) element.showModal();
      element.focus();
    });
  }
  ngOnDestroy() {
    if (this.previous?.isConnected) this.previous.focus();
  }
  @HostListener('keydown', ['$event']) onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dialogDismiss.emit();
    }
    if (event.key !== 'Tab') return;
    const nodes = Array.from(
      this.element.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      ),
    ).filter((node) => node.offsetParent !== null);
    const first = nodes[0],
      last = nodes.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === this.element.nativeElement)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === this.element.nativeElement)
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  @HostListener('cancel', ['$event']) onCancel(event: Event) {
    event.preventDefault();
    this.dialogDismiss.emit();
  }
}
