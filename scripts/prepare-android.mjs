import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function validateBetaOrigin(value) {
  if (!value)
    throw new Error('BETVERSE_BETA_ORIGIN manque : renseignez l’adresse HTTPS du serveur de test.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    url.username ||
    url.password ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost')
  ) {
    throw new Error(
      'BETVERSE_BETA_ORIGIN doit être une origine HTTPS exacte, sans /api, chemin ou slash final.',
    );
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const origin = validateBetaOrigin(process.env.BETVERSE_BETA_ORIGIN);
    const build = spawnSync(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build'], {
      stdio: 'inherit',
    });
    if (build.status !== 0) process.exit(build.status || 1);
    writeFileSync('dist/BetVerse/browser/mobile-config.json', JSON.stringify({ origin }) + '\n');
    const sync = spawnSync(
      process.execPath,
      ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'],
      {
        stdio: 'inherit',
      },
    );
    if (sync.error) throw sync.error;
    process.exitCode = sync.status || 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
