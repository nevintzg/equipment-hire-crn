import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import Handlebars from 'handlebars';
import { db } from '#src/db/client.js';
import {
  emailTemplates,
  notificationRules,
  outboxMessages,
  settings,
} from '#src/db/schema/index.js';
import { DEFAULT_TEMPLATES, LAYOUT } from './default-templates.js';
import { sendEmail } from './email.providers.js';
import { addHours, now } from '#src/lib/time.js';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('outbox');

/**
 * Transactional outbox.
 *
 * Emails are *written to the database* inside the same transaction as the
 * change they describe, then sent separately. This is the standard answer to a
 * problem that bites every booking system eventually:
 *
 *   - send inside the transaction → the transaction rolls back, but the
 *     customer has already been told their booking is confirmed;
 *   - send after the transaction with no record → the process dies between
 *     commit and send, and nobody is ever told.
 *
 * With an outbox row, the email is as durable as the booking itself, and
 * delivery is a separate, retryable concern. It also removes the need for a
 * queue server: the hourly tick drains whatever is pending, and
 * dispatchOutboxSoon() makes the common case feel instant.
 */

const compiled = new Map();
const compile = (source) => {
  let fn = compiled.get(source);
  if (!fn) {
    fn = Handlebars.compile(source, { noEscape: false });
    compiled.set(source, fn);
  }
  return fn;
};

/** Crude but adequate HTML → text, so every email has a plain-text part. */
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&middot;/g, '·')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/** Branding and contact details every template can reference. */
async function orgContext(tx, organisationId) {
  const rows = await tx
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, organisationId), eq(settings.isPublic, true)));
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    name: map['branding.organisationName'] ?? 'Equipment Hire',
    primaryColour: map['branding.primaryColour'] ?? '#0f6e56',
    contactEmail: map['contact.email'] ?? null,
    contactPhone: map['contact.phone'] ?? null,
  };
}

/**
 * Queue an email. MUST be called with the caller's transaction so the row
 * commits or rolls back with the change it describes.
 *
 * @param {import('#src/db/client.js').Tx} tx
 * @param {object} p
 * @param {string} p.organisationId
 * @param {string} p.templateCode
 * @param {string} p.toEmail
 * @param {string} [p.toName]
 * @param {string} [p.userId]
 * @param {string} [p.bookingId]
 * @param {Record<string, unknown>} [p.variables]
 */
export async function enqueueEmail(
  tx,
  { organisationId, templateCode, toEmail, toName, userId, bookingId, variables = {} },
) {
  // An organisation can mute an event in the admin panel.
  const [rule] = await tx
    .select({ isActive: notificationRules.isActive })
    .from(notificationRules)
    .where(
      and(
        eq(notificationRules.organisationId, organisationId),
        eq(notificationRules.eventCode, templateCode),
      ),
    )
    .limit(1);
  if (rule && !rule.isActive) {
    log.debug({ templateCode }, 'Notification muted by rule');
    return null;
  }

  const [stored] = await tx
    .select()
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.organisationId, organisationId),
        eq(emailTemplates.code, templateCode),
        eq(emailTemplates.isActive, true),
      ),
    )
    .limit(1);

  // Fall back to the built-in default if the organisation has no row yet —
  // a missing template must never be the reason a booking cannot be made.
  const template = stored ?? DEFAULT_TEMPLATES.find((t) => t.code === templateCode);
  if (!template) {
    log.error({ templateCode }, 'No template found; email dropped');
    return null;
  }

  const org = await orgContext(tx, organisationId);
  const context = { ...variables, org, siteUrl: variables.siteUrl ?? '' };

  let subject;
  let bodyHtml;
  try {
    subject = compile(template.subject)(context);
    const body = compile(template.bodyMarkdown)(context);
    bodyHtml = compile(LAYOUT)({ ...context, subject, body });
  } catch (err) {
    // A staff member can break a template with bad Handlebars. That must not
    // take a booking down with it.
    log.error({ err, templateCode }, 'Template failed to render; email dropped');
    return null;
  }

  const [row] = await tx
    .insert(outboxMessages)
    .values({
      organisationId,
      templateCode,
      toEmail,
      toName: toName ?? null,
      userId: userId ?? null,
      bookingId: bookingId ?? null,
      subject,
      bodyHtml,
      bodyText: htmlToText(bodyHtml),
      nextAttemptAt: now(),
    })
    .returning({ id: outboxMessages.id });

  return row.id;
}

/**
 * Send pending messages.
 *
 * FOR UPDATE SKIP LOCKED is what makes this safe to run concurrently: each
 * caller claims a disjoint set of rows instead of two ticks fighting over the
 * same message and sending it twice.
 *
 * @param {{limit?: number}} [opts]
 */
export async function flushOutbox({ limit = 25 } = {}) {
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.status, 'PENDING'),
          or(isNull(outboxMessages.nextAttemptAt), lte(outboxMessages.nextAttemptAt, now())),
        ),
      )
      .orderBy(asc(outboxMessages.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true });

    if (!rows.length) return [];

    // Claim them by pushing nextAttemptAt out, so a second flush starting
    // before this one finishes does not pick the same rows up again.
    await tx
      .update(outboxMessages)
      .set({ nextAttemptAt: addHours(now(), 1), attempts: sql`${outboxMessages.attempts} + 1` })
      .where(or(...rows.map((r) => eq(outboxMessages.id, r.id))));

    return rows;
  });

  let sent = 0;
  let failed = 0;

  for (const message of claimed) {
    try {
      const result = await sendEmail({
        to: message.toEmail,
        toName: message.toName,
        subject: message.subject,
        html: message.bodyHtml,
        text: message.bodyText,
      });
      await db
        .update(outboxMessages)
        .set({
          status: 'SENT',
          sentAt: now(),
          providerMessageId: result?.id ?? null,
          lastError: null,
          nextAttemptAt: null,
        })
        .where(eq(outboxMessages.id, message.id));
      sent += 1;
    } catch (err) {
      failed += 1;
      const attempts = (message.attempts ?? 0) + 1;
      // Exponential backoff, capped. After six tries (~12 hours of retries)
      // the message is marked DEAD so it stops consuming tick budget, and
      // shows up on the admin panel's failed-email list for a human.
      const dead = attempts >= 6;
      const backoffHours = Math.min(2 ** (attempts - 1), 12);
      log.warn({ err, messageId: message.id, attempts, dead }, 'Email send failed');
      await db
        .update(outboxMessages)
        .set({
          status: dead ? 'DEAD' : 'PENDING',
          lastError: String(err?.message ?? err).slice(0, 500),
          nextAttemptAt: dead ? null : addHours(now(), backoffHours),
        })
        .where(eq(outboxMessages.id, message.id));
    }
  }

  if (claimed.length) log.info({ sent, failed }, 'Outbox flushed');
  return { claimed: claimed.length, sent, failed };
}

/**
 * Nudge the outbox after a request has committed.
 *
 * Fire-and-forget on purpose: the customer should not wait for SMTP, and if
 * this fails the hourly tick will still deliver. setImmediate keeps it off the
 * response path.
 */
export function dispatchOutboxSoon() {
  setImmediate(() => {
    flushOutbox({ limit: 10 }).catch((err) => log.warn({ err }, 'Opportunistic flush failed'));
  });
}

export async function countPending() {
  const [row] = await db
    .select({ count: sql`count(*)::int` })
    .from(outboxMessages)
    .where(eq(outboxMessages.status, 'PENDING'));
  return row?.count ?? 0;
}
