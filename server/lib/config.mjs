import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function configFromEnv(env = process.env) {
  if (env.FCM_TOKEN_KEY && !/^[a-fA-F0-9]{64}$/.test(env.FCM_TOKEN_KEY))
    throw new Error('FCM_TOKEN_KEY doit contenir 64 caractères hexadécimaux.');
  if (env.FCM_PROJECT_ID && !/^[a-z][a-z0-9-]{4,62}$/.test(env.FCM_PROJECT_ID))
    throw new Error('FCM_PROJECT_ID invalide.');
  if (
    env.FCM_ENABLED === '1' &&
    (!env.FCM_TOKEN_KEY || !env.FCM_SERVICE_ACCOUNT_FILE || !env.FCM_PROJECT_ID)
  )
    throw new Error('Configurer clé, projet et compte de service avant FCM_ENABLED=1.');
  if (env.BACKUP_ENCRYPTION_KEY && !/^[a-fA-F0-9]{64}$/.test(env.BACKUP_ENCRYPTION_KEY))
    throw new Error('BACKUP_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux.');
  if (env.BACKUP_UPLOAD_BASE) {
    const url = new URL(env.BACKUP_UPLOAD_BASE);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error(
        'BACKUP_UPLOAD_BASE doit être une URL HTTPS sans identifiants ni paramètres.',
      );
  }
  if (
    env.BACKUP_ENABLED === '1' &&
    (!env.BACKUP_ENCRYPTION_KEY || !env.BACKUP_DIRECTORY || !env.BACKUP_UPLOAD_BASE)
  )
    throw new Error('Configurer clé, dossier et stockage distant avant BACKUP_ENABLED=1.');
  if (
    env.LEGAL_READY === '1' &&
    (!env.EDITOR_ADDRESS || !env.EDITOR_STATUS || env.SUPPORT_VERIFIED !== '1')
  )
    throw new Error(
      'Compléter EDITOR_ADDRESS, EDITOR_STATUS et SUPPORT_VERIFIED avant LEGAL_READY=1.',
    );
  if (env.ADMIN_MFA_KEY && !/^[a-fA-F0-9]{64}$/.test(env.ADMIN_MFA_KEY))
    throw new Error('ADMIN_MFA_KEY doit contenir 64 caractères hexadécimaux.');
  if (env.ADMIN_MFA_REQUIRED === '1' && !env.ADMIN_MFA_KEY)
    throw new Error('ADMIN_MFA_KEY est requis avec ADMIN_MFA_REQUIRED=1.');
  const oddsMode = env.THE_ODDS_API_MODE || 'disabled';
  if (!['disabled', 'manual'].includes(oddsMode))
    throw new Error('THE_ODDS_API_MODE accepte uniquement disabled ou manual.');
  const oddsDailyLimit = Number(env.THE_ODDS_API_DAILY_LIMIT || 10);
  const oddsMonthlyLimit = Number(env.THE_ODDS_API_MONTHLY_LIMIT || 400);
  if (!Number.isInteger(oddsDailyLimit) || oddsDailyLimit < 1 || oddsDailyLimit > 100)
    throw new Error('THE_ODDS_API_DAILY_LIMIT doit être un entier entre 1 et 100.');
  if (!Number.isInteger(oddsMonthlyLimit) || oddsMonthlyLimit < 1 || oddsMonthlyLimit > 500)
    throw new Error('THE_ODDS_API_MONTHLY_LIMIT doit être un entier entre 1 et 500.');
  const footballMode = env.API_FOOTBALL_MODE || 'disabled';
  if (!['disabled', 'manual'].includes(footballMode))
    throw new Error('API_FOOTBALL_MODE accepte uniquement disabled ou manual.');
  const footballDailyLimit = Number(env.API_FOOTBALL_DAILY_LIMIT || 10);
  if (!Number.isInteger(footballDailyLimit) || footballDailyLimit < 1 || footballDailyLimit > 100)
    throw new Error('API_FOOTBALL_DAILY_LIMIT doit être un entier entre 1 et 100.');
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
    pushEnabled: env.FCM_ENABLED === '1',
    pushAccountFile: env.FCM_SERVICE_ACCOUNT_FILE,
    pushTokenKey: env.FCM_TOKEN_KEY,
    pushProject: env.FCM_PROJECT_ID,
    backupKey: env.BACKUP_ENCRYPTION_KEY,
    backupDirectory: env.BACKUP_DIRECTORY,
    backupUploadBase: env.BACKUP_UPLOAD_BASE,
    backupUploadAuth: env.BACKUP_UPLOAD_AUTH,
    backupEnabled: env.BACKUP_ENABLED === '1',
    legalReady: env.LEGAL_READY === '1',
    supportVerified: env.SUPPORT_VERIFIED === '1',
    editorAddress: env.EDITOR_ADDRESS,
    editorStatus: env.EDITOR_STATUS,
    adminMfaKey: env.ADMIN_MFA_KEY,
    adminMfaRequired: env.ADMIN_MFA_REQUIRED === '1',
    oddsMode,
    oddsKey: env.THE_ODDS_API_KEY,
    oddsDailyLimit,
    oddsMonthlyLimit,
    production,
    footballMode,
    footballKey: env.API_FOOTBALL_KEY,
    footballDailyLimit,
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
