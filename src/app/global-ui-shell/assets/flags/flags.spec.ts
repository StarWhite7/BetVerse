import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Flags } from './flags';

describe('Flags', () => {
  let component: Flags;
  let fixture: ComponentFixture<Flags>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Flags]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Flags);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
