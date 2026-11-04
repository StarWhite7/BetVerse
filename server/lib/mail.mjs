import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export function mailSender(config) {
  if (config.mailSender) return config.mailSender;
  const transport = config.smtpUrl
    ? nodemailer.createTransport(config.smtpUrl, {
        disableFileAccess: true,
        disableUrlAccess: true,
        requireTLS: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;
  return async ({ to, subject, text }) => {
    const mail = { from: config.mailFrom || 'dev@betverse.local', to, subject, text };
    if (transport) await transport.sendMail(mail);
    else if (!config.test) {
      await mkdir(config.mailDir, { recursive: true });
      await writeFile(join(config.mailDir, `${randomUUID()}.json`), JSON.stringify(mail, null, 2), {
        mode: 0o600,
      });
    }
  };
}
