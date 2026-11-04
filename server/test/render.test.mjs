import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnvironment } from '../lib/render.mjs';

const base = {
  RENDER: 'true',
  RENDER_EXTERNAL_URL: 'https://betverse-beta-example.onrender.com',
  DATABASE_PATH: '/var/data/betverse.sqlite',
  SMTP_URL: 'smtps://user:password@smtp.example.test:465',
  MAIL_FROM: 'BetVerse <test@example.test>',
};
test('Render uses its assigned HTTPS URL and enforces production', () => {
  const env = renderEnvironment({ ...base, NODE_ENV: 'development' });
  assert.equal(env.APP_ORIGIN, base.RENDER_EXTERNAL_URL);
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.HOST, '0.0.0.0');
  assert.equal(
    renderEnvironment({ ...base, APP_ORIGIN: 'https://beta.betverse.fr' }).APP_ORIGIN,
    'https://beta.betverse.fr',
  );
});
test('Render refuses missing persistence, SMTP or HTTPS instead of using development defaults', () => {
  for (const change of [
    { RENDER: undefined },
    { DATABASE_PATH: undefined },
    { DATABASE_PATH: 'local.sqlite' },
    { SMTP_URL: undefined },
    { MAIL_FROM: undefined },
    { RENDER_EXTERNAL_URL: undefined },
    { APP_ORIGIN: 'http://beta.betverse.fr' },
  ])
    assert.throws(() => renderEnvironment({ ...base, ...change }));
});
