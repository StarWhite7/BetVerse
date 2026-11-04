import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function configFromEnv(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = env.APP_ORIGIN || 'http://localhost:4200';
  const parsed = new URL(origin);
  if (parsed.origin !== origin || (production && parsed.protocol !== 'https:')) {
    throw new Error(
      'APP_ORIGIN doit être une origine exacte (HTTPS en production), sans chemin ni slash final.',
    );
  }
  if (production && (!env.SMTP_URL || !env.MAIL_FROM))
    throw new Error('SMTP_URL et MAIL_FROM sont requis en production.');
  if (env.SMTP_URL && !['smtp:', 'smtps:'].includes(new URL(env.SMTP_URL).protocol))
    throw new Error('SMTP_URL doit utiliser smtp:// ou smtps://.');
  return {
    production,
    origin,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3001),
    database: resolve(env.DATABASE_PATH || resolve(root, 'server/.data/betverse.sqlite')),
    staticDir: resolve(root, 'dist/BetVerse/browser'),
    mailDir: resolve(root, 'server/.data/mail'),
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM,
    trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
    cookieName: production ? '__Host-betverse_session' : 'betverse_session',
    sessionMs: 12 * 60 * 60 * 1000,
  };
}
