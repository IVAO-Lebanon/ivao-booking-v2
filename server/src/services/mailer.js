// Email transport. Uses real SMTP when configured (env SMTP_*), otherwise a
// dev "json" transport that doesn't actually send but resolves successfully - so
// the whole pipeline (recipients, templates, success/failure reporting) is
// exercisable locally. Batches are sent with a small concurrency limit.
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;

export function isEmailConfigured() {
  return Boolean(config.email.host && config.email.user);
}

function getTransport() {
  if (transport) return transport;
  if (isEmailConfigured()) {
    transport = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: { user: config.email.user, pass: config.email.pass },
      // Fail fast: without these a wrong host (e.g. one behind a proxy that does
      // not pass SMTP) leaves the request hanging until a very long default timeout.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      // Allow a self-signed / hostname-mismatched cert (common when SMTP_HOST is
      // localhost on the same box). Opt-in via SMTP_ALLOW_INVALID_CERT=true.
      ...(config.email.allowInvalidCert ? { tls: { rejectUnauthorized: false } } : {}),
    });
  } else {
    // Dev: pretend-send (no SMTP). Messages resolve as sent.
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

async function sendOne({ to, subject, html, text, attachments }) {
  try {
    await getTransport().sendMail({ from: config.email.from, to, subject, html, text, attachments });
    return { to, ok: true };
  } catch (err) {
    return { to, ok: false, error: err.message };
  }
}

/**
 * Send many messages with limited concurrency. Returns per-message results plus
 * totals so callers can report success/failure precisely.
 * messages: [{ to, subject, html }]
 */
export async function sendBulk(messages, concurrency = 5) {
  const results = [];
  for (let i = 0; i < messages.length; i += concurrency) {
    const batch = messages.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map(sendOne));
    results.push(...settled);
  }
  const sent = results.filter((r) => r.ok).length;
  return { sent, failed: results.length - sent, total: results.length, results };
}
