import { readFile } from 'node:fs/promises';
import { createSign, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ensure } from './errors.mjs';
const scope = 'https://www.googleapis.com/auth/firebase.messaging';
export function sealToken(value, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from('betverse-push-v1'));
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
}
function openToken(value, key) {
  const bytes = Buffer.from(value, 'base64'),
    cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from('betverse-push-v1'));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
export function pushWorker(db, config) {
  const configured = Boolean(config.pushEnabled && config.pushAccountFile && config.pushTokenKey);
  const state = { configured, lastSuccess: null, lastError: null };
  let running = false,
    access = null,
    expires = 0;
  const send = config.pushFetch || fetch;
  const request = async (url, options) => {
    const response = await send(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    ensure(text.length < 1024 * 1024, 502, 'Réponse push invalide.');
    return { ok: response.ok, status: response.status, body: JSON.parse(text || '{}') };
  };
  async function token() {
    if (access && expires > Date.now() + 60000) return access;
    const account = JSON.parse(await readFile(config.pushAccountFile, 'utf8'));
    ensure(
      account.project_id === config.pushProject &&
        account.client_email?.endsWith('.iam.gserviceaccount.com') &&
        account.private_key,
      503,
      'Compte push invalide.',
    );
    const time = Math.floor(Date.now() / 1000),
      encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned =
      encode({ alg: 'RS256', typ: 'JWT' }) +
      '.' +
      encode({
        iss: account.client_email,
        scope,
        aud: 'https://oauth2.googleapis.com/token',
        iat: time,
        exp: time + 3600,
      });
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const assertion = unsigned + '.' + signer.sign(account.private_key, 'base64url');
    const response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    ensure(
      response.ok && typeof response.body.access_token === 'string',
      502,
      'Authentification push refusée.',
    );
    access = response.body.access_token;
    expires = Date.now() + Math.min(3600, Number(response.body.expires_in) || 0) * 1000;
    return access;
  }
  async function run() {
    if (!configured || running) return;
    running = true;
    try {
      const rows = db
        .prepare(
          "SELECT o.notificationId,o.tokenHash,d.cipher,d.userId FROM push_outbox o JOIN push_devices d ON d.tokenHash=o.tokenHash JOIN user_preferences p ON p.userId=d.userId JOIN sessions s ON s.tokenHash=d.sessionHash JOIN users u ON u.id=d.userId WHERE o.state='PENDING' AND p.push=1 AND s.expiresAt>? AND u.status='ACTIVE' ORDER BY o.createdAt LIMIT 25",
        )
        .all(Date.now());
      for (const row of rows) {
        // Reserve once before network I/O; interrupted deliveries are never replayed automatically.
        if (
          !db
            .prepare(
              "UPDATE push_outbox SET state='FAILED' WHERE notificationId=? AND tokenHash=? AND state='PENDING'",
            )
            .run(row.notificationId, row.tokenHash).changes
        )
          continue;
        try {
          const auth = await token();
          // Recheck opt-in and session after OAuth network latency or a concurrent logout.
          if (
            !db
              .prepare(
                'SELECT 1 FROM push_devices d JOIN user_preferences p ON p.userId=d.userId JOIN sessions s ON s.tokenHash=d.sessionHash WHERE d.tokenHash=? AND p.push=1 AND s.expiresAt>?',
              )
              .get(row.tokenHash, Date.now())
          )
            continue;
          const response = await request(
            `https://fcm.googleapis.com/v1/projects/${config.pushProject}/messages:send`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: {
                  token: openToken(row.cipher, config.pushTokenKey),
                  notification: {
                    title: 'BetVerse',
                    body: 'Une nouvelle activité est disponible dans votre centre de notifications.',
                  },
                  android: { notification: { channel_id: 'betverse_activity' }, ttl: '3600s' },
                },
              }),
            },
          );
          if (response.ok) {
            db.prepare(
              "UPDATE push_outbox SET state='SENT' WHERE notificationId=? AND tokenHash=?",
            ).run(row.notificationId, row.tokenHash);
            state.lastSuccess = new Date().toISOString();
            state.lastError = null;
          } else {
            if (response.body.error?.details?.some((d) => d.errorCode === 'UNREGISTERED'))
              db.prepare('DELETE FROM push_devices WHERE tokenHash=?').run(row.tokenHash);
            throw Error();
          }
        } catch {
          state.lastError =
            'Envoi push refusé ou interrompu. Vérifier les droits FCM et le compte de service.';
        }
      }
    } finally {
      running = false;
    }
  }
  const timer = configured
    ? setInterval(
        () =>
          run().catch(() => {
            state.lastError = 'File push indisponible.';
          }),
        60000,
      ).unref()
    : null;
  return {
    state,
    run,
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
