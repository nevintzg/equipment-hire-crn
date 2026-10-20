import { env } from '#src/config/env.js';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('email');

/**
 * Pluggable email transport.
 *
 * Three providers behind one interface, chosen by EMAIL_PROVIDER:
 *
 *   log     writes to the log and sends nothing — used in tests and CI
 *   smtp    local Mailpit in development, or any SMTP relay
 *   resend  production, because its free tier covers the pilot's volume
 *
 * Both real providers are imported lazily, so a deployment using one does not
 * pay the startup cost of the other's SDK.
 */

/** @typedef {{to: string, toName?: string|null, subject: string, html: string, text: string}} Message */

const providers = {
  log: async (message) => {
    log.info({ to: message.to, subject: message.subject }, 'Email (not sent — log provider)');
    return { id: `log-${Date.now()}` };
  },

  smtp: async (message) => {
    const { createTransport } = await import('nodemailer');
    transport ??= createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    const info = await transport.sendMail({
      from: env.EMAIL_FROM,
      replyTo: env.EMAIL_REPLY_TO || undefined,
      to: message.toName ? `"${message.toName.replace(/"/g, '')}" <${message.to}>` : message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { id: info.messageId };
  },

  resend: async (message) => {
    const { Resend } = await import('resend');
    resend ??= new Resend(env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      replyTo: env.EMAIL_REPLY_TO || undefined,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    // The SDK returns errors rather than throwing; the outbox needs a throw to
    // schedule a retry.
    if (error) throw new Error(`Resend: ${error.message ?? JSON.stringify(error)}`);
    return { id: data?.id };
  },
};

let transport = null;
let resend = null;

/**
 * Send one message. Throws on failure — the outbox decides whether to retry.
 * @param {Message} message
 */
export async function sendEmail(message) {
  const provider = providers[env.EMAIL_PROVIDER] ?? providers.log;
  return provider(message);
}

export const activeProvider = () => env.EMAIL_PROVIDER;
