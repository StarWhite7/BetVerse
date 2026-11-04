import { accessSync, constants, statSync } from 'node:fs';
import { renderEnvironment } from '../server/lib/render.mjs';

const env = renderEnvironment();
if (!statSync('/var/data').isDirectory())
  throw new Error('Disque persistant /var/data introuvable.');
accessSync('/var/data', constants.R_OK | constants.W_OK);
// The mount is provisioned in Render, never created by this launcher as a fallback.
for (const key of ['NODE_ENV', 'HOST', 'APP_ORIGIN']) process.env[key] = env[key];
await import('../server/index.mjs');
