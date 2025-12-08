const globalApi =
  (globalThis as { NG_APP_API_URL?: string | undefined }).NG_APP_API_URL ??
  (globalThis as { __env?: { API_URL?: string } }).__env?.API_URL;

const metaApi =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { NG_APP_API_URL?: string } }).env?.NG_APP_API_URL;

export const environment = {
  apiUrl: globalApi || metaApi || 'http://localhost:3001',
};
