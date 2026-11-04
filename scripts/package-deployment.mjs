import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = spawnSync(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build'], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status || 1);

const output = join(root, 'dist/deployment');
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, 'betverse-beta-'));

async function copyFile(relative) {
  const target = join(staging, relative);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(root, relative), target);
}

// Explicit allowlist. Never archive server/.env, .data, test accounts, keys or node_modules.
for (const name of ['app.mjs', 'index.mjs', 'cli.mjs', 'package.json', 'package-lock.json']) {
  await copyFile(`server/${name}`);
}
async function copySourceDirectory(relative) {
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await copySourceDirectory(path);
    else if (entry.isFile() && ['.mjs', '.sql'].includes(extname(entry.name))) await copyFile(path);
  }
}
for (const name of ['db', 'domain', 'lib', 'routes']) await copySourceDirectory(`server/${name}`);
await cp(join(root, 'dist/BetVerse/browser'), join(staging, 'dist/BetVerse/browser'), {
  recursive: true,
});
const manifest = {
  name: 'betverse-beta-server',
  version: '1.0.0',
  private: true,
  engines: { node: '^24.15.0 || ^26.0.0' },
  scripts: {
    build: 'npm --prefix server ci --omit=dev --ignore-scripts',
    start: 'node --env-file-if-exists=server/.env server/index.mjs',
    admin: 'node --env-file-if-exists=server/.env server/cli.mjs admin',
    backup: 'node --env-file-if-exists=server/.env server/cli.mjs backup',
  },
};
await writeFile(join(staging, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(staging, 'package-lock.json'),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: manifest.name, version: manifest.version, engines: manifest.engines },
      },
    },
    null,
    2,
  ) + '\n',
);
await cp(join(root, 'docs/INFOMANIAK_BETA.md'), join(staging, 'DEPLOIEMENT.md'));

const archive = `${staging}.zip`;
if (process.platform !== 'win32') {
  console.log(`Dossier prêt : ${staging}. Archivez son contenu avant importation.`);
} else {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:BETVERSE_PACKAGE_DIR, $env:BETVERSE_PACKAGE_ZIP)",
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        BETVERSE_PACKAGE_DIR: resolve(staging),
        BETVERSE_PACKAGE_ZIP: archive,
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(`Archive de déploiement : ${archive}`);
}
