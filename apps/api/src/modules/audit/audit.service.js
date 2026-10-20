import { and, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { auditLogs, users } from '#src/db/schema/index.js';
import { paginated, toLimitOffset } from '#src/lib/pagination.js';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('audit');

/** Field names that must never be written into an audit record. */
const REDACT = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'tokenHash',
  'stripeSecretKeyEnc',
  'stripeWebhookSecretEnc',
  'secret',
  'apiKey',
]);

const scrub = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT.has(k) ? '[redacted]' : v;
  }
  return out;
};

/**
 * Record an administrative action.
 *
 * Fire-and-forget: the client's governance requirement is that actions are
 * traceable, but a failure to write the trail must not roll back the action
 * itself — a manager should not be unable to approve a booking because the
 * audit insert hit a constraint. Failures are logged loudly instead.
 *
 * Pass `tx` to make the record atomic with its action where that is wanted.
 */
export async function recordAudit({
  tx,
  organisationId,
  actorUserId,
  action,
  entityType,
  entityId,
  before,
  after,
  req,
}) {
  const payload = {
    organisationId,
    actorUserId: actorUserId ?? null,
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    changes: diff(before, after),
    ipAddress: req?.ip ?? null,
    userAgent: req?.headers?.['user-agent']?.slice(0, 500) ?? null,
    requestId: req?.id ?? null,
  };

  try {
    await (tx ?? db).insert(auditLogs).values(payload);
  } catch (err) {
    log.error({ err, action, entityType, entityId }, 'Failed to write audit record');
  }
}

/** Only the fields that actually changed, so the log stays readable. */
function diff(before, after) {
  if (!before && !after) return {};
  if (!before) return { created: scrub(after) };
  if (!after) return { deleted: scrub(before) };

  const changes = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    changes[key] = REDACT.has(key) ? { from: '[redacted]', to: '[redacted]' } : { from: a, to: b };
  }
  return changes;
}

/** Express middleware factory: records a successful mutating request. */
export const auditAction = (action, entityType) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.auth) return;
    recordAudit({
      organisationId: req.auth.organisationId,
      actorUserId: req.auth.userId,
      action,
      entityType,
      entityId: req.params?.id ?? null,
      after: req.valid?.body ? scrub(req.valid.body) : undefined,
      req,
    });
  });
  next();
};

export async function listAuditLogs({ org, query }) {
  const { limit, offset } = toLimitOffset(query);
  const filters = [eq(auditLogs.organisationId, org.id)];
  if (query.action) filters.push(ilike(auditLogs.action, `%${query.action}%`));
  if (query.entityType) filters.push(eq(auditLogs.entityType, query.entityType));
  if (query.entityId) filters.push(eq(auditLogs.entityId, query.entityId));
  if (query.actorUserId) filters.push(eq(auditLogs.actorUserId, query.actorUserId));
  if (query.from) filters.push(gte(auditLogs.createdAt, new Date(query.from)));
  if (query.to) filters.push(lte(auditLogs.createdAt, new Date(`${query.to}T23:59:59`)));

  const where = and(...filters);
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      changes: auditLogs.changes,
      createdAt: auditLogs.createdAt,
      requestId: auditLogs.requestId,
      actor: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return paginated(rows, rows.length + offset, query);
}
