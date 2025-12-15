import { Directive, ElementRef } from '@angular/core';

@Directive({
  selector: '[sharedAutofocus]'
})
export class AutofocusDirective {
  constructor(private el: ElementRef) {
    setTimeout(() => this.el.nativeElement.focus(), 0);
  }
}