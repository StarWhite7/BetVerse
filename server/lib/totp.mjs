import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += ALPHABET[(value << (5 - bits)) & 31];
  return result;
}
export function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', secret).update(counter).digest();
  const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function validStep(secret, code, lastStep = -1) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(Date.now() / 30000);
  for (const candidate of [step, step - 1, step + 1])
    if (
      candidate > lastStep &&
      timingSafeEqual(Buffer.from(totp(secret, candidate)), Buffer.from(code))
    )
      return candidate;
  return null;
}
export function encryptSecret(secret, keyHex) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  cipher.setAAD(Buffer.from('betverse-admin-totp-v1'));
  return [iv, Buffer.concat([cipher.update(secret), cipher.final()]), cipher.getAuthTag()]
    .map((value) => value.toString('base64'))
    .join('.');
}
export function decryptSecret(value, keyHex) {
  const [iv, data, tag] = value.split('.').map((part) => Buffer.from(part, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  cipher.setAAD(Buffer.from('betverse-admin-totp-v1'));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}
