import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function strongPasswordValidator(): ValidatorFn {
  const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) return null;
    return pattern.test(value) ? null : { strongPassword: true };
  };
}

export function matchControlValidator(
  controlName: string,
  matchingControlName: string,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const control = group.get(controlName);
    const matchingControl = group.get(matchingControlName);
    if (!control || !matchingControl) return null;

    if (
      matchingControl.errors &&
      !matchingControl.errors['mismatch']
    ) {
      return null;
    }

    if (control.value !== matchingControl.value) {
      matchingControl.setErrors({ mismatch: true });
      return { mismatch: true };
    }

    matchingControl.setErrors(null);
    return null;
  };
}
