import qrcode from 'qrcode-generator';

export interface AuthenticatorQr {
  size: number;
  path: string;
}

// Only SVG geometry leaves this function. No remote image, storage or HTML injection.
export function authenticatorQr(secret: string, account: string): AuthenticatorQr {
  if (!/^[A-Z2-7]{16,128}$/.test(secret) || !account.trim() || account.length > 254) {
    throw new Error('Configuration du QR code invalide.');
  }
  const label = encodeURIComponent(`BetVerse:${account}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=BetVerse&algorithm=SHA1&digits=6&period=30`;
  const qr = qrcode(0, 'M');
  qr.addData(uri, 'Byte');
  qr.make();
  const modules = qr.getModuleCount();
  const margin = 4;
  const cells: string[] = [];
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) cells.push(`M${col + margin},${row + margin}h1v1h-1z`);
    }
  }
  return { size: modules + margin * 2, path: cells.join('') };
}
