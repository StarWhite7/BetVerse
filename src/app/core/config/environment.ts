const globalApi =
  (globalThis as { NG_APP_API_URL?: string | undefined }).NG_APP_API_URL ??
  (globalThis as { __env?: { API_URL?: string } }).__env?.API_URL;

const metaApi =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { NG_APP_API_URL?: string } }).env?.NG_APP_API_URL;

const hostApi =
  typeof window !== 'undefined'
    ? {
        'betverse.fr': 'https://api.betverse.fr',
        'www.betverse.fr': 'https://api.betverse.fr',
        'bet-verse.vercel.app': 'https://api.bet-verse.vercel.app',
      }[window.location.hostname]
    : undefined;

export const environment = {
  apiUrl: globalApi || metaApi || hostApi || 'http://localhost:3001',
};
