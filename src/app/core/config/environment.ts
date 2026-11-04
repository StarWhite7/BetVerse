// Same-origin API. Angular's proxy handles local development.
export const environment: { apiUrl: string; mobileOrigin: string | null } = {
  apiUrl: '/api',
  mobileOrigin: null,
};

export function configureMobileApi(origin: string) {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost')
  )
    throw new Error('La bêta Android exige une origine serveur HTTPS exacte.');
  environment.apiUrl = `${origin}/api`;
  environment.mobileOrigin = origin;
}
