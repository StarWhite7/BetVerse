const globalApi =
  (globalThis as { NG_APP_API_URL?: string | undefined }).NG_APP_API_URL ??
  (globalThis as { __env?: { API_URL?: string } }).__env?.API_URL;

const metaApi =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { NG_APP_API_URL?: string } }).env?.NG_APP_API_URL;

const getHostApi = (hostname: string) => {
  const staticMap: Record<string, string> = {
    'betverse.fr': 'https://api.betverse.fr',
    'www.betverse.fr': 'https://api.betverse.fr',
    'bet-verse.vercel.app': 'https://betverse-backend.vercel.app',
    'betverse.vercel.app': 'https://betverse-backend.vercel.app',
  };

  if (staticMap[hostname]) {
    return staticMap[hostname];
  }

  if (hostname.endsWith('.bet-verse.vercel.app') || hostname.endsWith('-bet-verse.vercel.app')) {
    return 'https://betverse-backend.vercel.app';
  }

  return undefined;
};

const hostApi = typeof window !== 'undefined' ? getHostApi(window.location.hostname) : undefined;

const fallbackApi =
  typeof window !== 'undefined' && window.location.hostname.includes('localhost')
    ? 'http://localhost:3001'
    : 'https://betverse-backend.vercel.app';

export const environment = {
  apiUrl: hostApi || globalApi || metaApi || fallbackApi,
};
