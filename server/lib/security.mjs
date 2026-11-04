import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const secret = () => randomBytes(32).toString('hex');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const modern = stored.startsWith('scrypt$');
  const [, N, r, p, modernSalt, modernValue] = modern ? stored.split('$') : [];
  const [, oldSalt, oldValue] = modern ? [] : stored.split(':');
  const salt = modern ? modernSalt : oldSalt,
    value = modern ? modernValue : oldValue;
  const expected = Buffer.from(value, 'hex');
  const actual = await scrypt(password, salt, 64, {
    N: modern ? Number(N) : 32768,
    r: modern ? Number(r) : 8,
    p: modern ? Number(p) : 1,
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function readCookie(req, name) {
  return req.headers.cookie
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export const cookieOptions = (config) => ({
  httpOnly: true,
  secure: config.production,
  sameSite: 'lax',
  path: '/',
  maxAge: config.sessionMs,
});
