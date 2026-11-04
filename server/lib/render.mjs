import { configFromEnv } from './config.mjs';

export function renderEnvironment(env = process.env) {
  if (env.RENDER !== 'true')
    throw new Error('Ce lanceur est réservé à Render. En local : npm start.');
  if (env.DATABASE_PATH !== '/var/data/betverse.sqlite') {
    throw new Error(
      'Render exige DATABASE_PATH=/var/data/betverse.sqlite et un disque monté sur /var/data.',
    );
  }
  const result = {
    ...env,
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    APP_ORIGIN: env.APP_ORIGIN || env.RENDER_EXTERNAL_URL,
  };
  if (!result.APP_ORIGIN) throw new Error('APP_ORIGIN ou RENDER_EXTERNAL_URL manque.');
  configFromEnv(result); // Fail closed on invalid HTTPS and missing mail configuration.
  return result;
}
