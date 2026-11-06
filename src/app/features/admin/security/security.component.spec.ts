import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import jsQR from 'jsqr';
import { authenticatorQr } from './authenticator-qr';
import { SecurityComponent } from './security.component';

// Synthetic key only. Never use an actual enrolment secret in tests/screenshots.
const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const account = 'admin+recette@betverse.test';

describe('Authenticator QR', () => {
  it('decodes independently to the exact TOTP account, issuer and parameters', () => {
    const image = authenticatorQr(secret, account);
    const scale = 6;
    const width = image.size * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (const match of image.path.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) {
      const x = Number(match[1]) * scale;
      const y = Number(match[2]) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset = ((y + dy) * width + x + dx) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        }
      }
    }
    const decoded = jsQR(pixels, width, width);
    expect(decoded).not.toBeNull();
    const uri = new URL(decoded!.data);
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.hostname).toBe('totp');
    expect(decodeURIComponent(uri.pathname.slice(1))).toBe(`BetVerse:${account}`);
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret,
      issuer: 'BetVerse',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });

  it('rejects malformed secrets and missing account labels', () => {
    expect(() => authenticatorQr('not-a-secret', account)).toThrow();
    expect(() => authenticatorQr(secret, '')).toThrow();
  });
});

describe('MFA enrolment screen', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function screen() {
    const fixture = TestBed.createComponent(SecurityComponent);
    fixture.detectChanges();
    http
      .expectOne('/api/admin/security')
      .flush({ configured: true, enrolled: false, verified: false });
    fixture.componentInstance.password = 'Synthetic-test-password';
    fixture.componentInstance.setup();
    http.expectOne('/api/admin/security/setup').flush({ secret, account });
    fixture.detectChanges();
    return fixture;
  }

  it('renders a local SVG and clears the QR and secret after successful verification', () => {
    const fixture = screen();
    expect(
      fixture.nativeElement.querySelector('svg[role="img"] path').getAttribute('d'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    const component = fixture.componentInstance;
    expect(component.password).toBe('');
    component.code = '123456';
    component.verify();
    http.expectOne('/api/admin/security/verify').flush({ recoveryCodes: ['SYNTHETIC-RECOVERY'] });
    http
      .expectOne('/api/admin/security')
      .flush({ configured: true, enrolled: true, verified: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(secret);
    expect(component.qr()).toBeNull();
    expect(component.code).toBe('');
  });

  it('drops enrolment material when leaving the screen', () => {
    const fixture = screen();
    const component = fixture.componentInstance;
    fixture.destroy();
    expect(component.qr()).toBeNull();
    expect(component.secret()).toBe('');
    expect(component.recovery()).toEqual([]);
  });
});
