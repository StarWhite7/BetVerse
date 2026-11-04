import { FormControl, FormGroup } from '@angular/forms';
import { matchControlValidator, strongPasswordValidator } from './validators';
describe('Account validation', () => {
  it('uses the same password length and complexity for signup and reset', () => {
    const validator = strongPasswordValidator();
    for (const value of [
      'short1A',
      'onlylowercase123',
      'ONLYUPPERCASE123',
      'NoDigitsHere',
      'a'.repeat(129),
    ])
      expect(validator(new FormControl(value))).toEqual({ strongPassword: true });
    expect(validator(new FormControl('MyPassword123'))).toBeNull();
  });
  it('preserves required confirmation errors and detects a changed password', () => {
    const group = new FormGroup({
      password: new FormControl('MyPassword123'),
      confirmPassword: new FormControl('Different123'),
    });
    const validator = matchControlValidator('password', 'confirmPassword');
    expect(validator(group)).toEqual({ mismatch: true });
    group.controls.confirmPassword.setValue('MyPassword123');
    expect(validator(group)).toBeNull();
  });
});
