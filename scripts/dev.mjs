import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--watch', 'index.mjs'], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)),
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve'], {
    cwd: root,
    stdio: 'inherit',
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
