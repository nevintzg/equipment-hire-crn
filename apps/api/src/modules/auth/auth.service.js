import { and, eq, gt, isNull, lt, ne, notInArray, or } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '#src/db/client.js';
import {
  authTokens,
  customerTypes,
  rolePermissions,
  roles,
  permissions as permissionsTable,
  sessions,
  userRoles,
  users,
} from '#src/db/schema/index.js';
import { env } from '#src/config/env.js';
import { hashPassword, needsRehash, verifyPassword } from '#src/lib/password.js';
import { randomToken, sha256 } from '#src/lib/tokens.js';
import { signAccessToken } from '#src/lib/jwt.js';
import { addDays, addHours, now } from '#src/lib/time.js';
import { conflict, forbidden, unauthorized } from '#src/lib/errors.js';
import { childLogger } from '#src/config/logger.js';
import { enqueueEmail } from '#src/modules/notifications/outbox.service.js';
import { getAppUrl } from '#src/modules/site/site.service.js';

const log = childLogger('auth');

/** Shape returned to the client. Never includes the password hash. */
export function toPublicUser(user, extra = {}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    hirerOrgName: user.hirerOrgName ?? null,
    hirerAbn: user.hirerAbn ?? null,
    customerTypeId: user.customerTypeId ?? null,
    customerTypeConfirmed: Boolean(user.customerTypeConfirmedAt),
    emailVerified: Boolean(user.emailVerifiedAt),
    address: {
      line1: user.addressLine1 ?? null,
      line2: user.addressLine2 ?? null,
      suburb: user.suburb ?? null,
      state: user.state ?? null,
      postcode: user.postcode ?? null,
    },
    createdAt: user.createdAt,
    ...extra,
  };
}

/**
 * Permission codes for a user, flattened across their roles.
 * OWNER's '*' is preserved as a wildcard rather than expanded.
 */
async function loadPermissions(tx, userId) {
  const rows = await tx
    .select({ code: permissionsTable.code, roleCode: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  if (rows.some((r) => r.roleCode === 'OWNER')) return ['*'];
  return [...new Set(rows.map((r) => r.code).filter(Boolean))];
}

/** True when the user holds any staff role — gates the admin panel. */
async function isStaff(tx, userId) {
  const rows = await tx
    .select({ id: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Issue a refresh token and its session row.
 *
 * `familyId` chains every rotation back to the original login. If a token is
 * ever presented twice (the classic sign of a stolen token being replayed
 * after the legitimate client already rotated it), every session in the family
 * is revoked — the attacker and the victim are both logged out, which is the
 * safe outcome.
 */
async function issueSession(tx, { userId, organisationId, app, familyId, req }) {
  const token = randomToken();
  const id = uuidv7();
  await tx.insert(sessions).values({
    id,
    userId,
    organisationId,
    app,
    tokenHash: sha256(token),
    familyId: familyId ?? id,
    userAgent: req?.headers['user-agent']?.slice(0, 500) ?? null,
    ipAddress: req?.ip ?? null,
    expiresAt: addDays(now(), env.REFRESH_TOKEN_TTL_DAYS),
  });
  return { token, sessionId: id, familyId: familyId ?? id };
}

async function buildTokens(tx, { user, organisationId, app, req, familyId }) {
  const perms = app === 'admin' ? await loadPermissions(tx, user.id) : [];
  const session = await issueSession(tx, { userId: user.id, organisationId, app, familyId, req });
  const accessToken = await signAccessToken({
    userId: user.id,
    organisationId,
    app,
    permissions: perms,
    sessionId: session.sessionId,
  });
  return {
    accessToken,
    refreshToken: session.token,
    expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60,
    permissions: perms,
    sessionId: session.sessionId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

export async function register({ org, input, req }) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organisationId, org.id), eq(users.email, input.email)))
    .limit(1);

  if (existing.length) {
    // Deliberately the same shape of answer as success would give, so the
    // registration form cannot be used to discover who has an account. The
    // email we send tells the real owner what happened.
    log.info({ email: input.email }, 'Registration attempt for existing email');
    await db.transaction(async (tx) => {
      await enqueueEmail(tx, {
        organisationId: org.id,
        templateCode: 'account.duplicate_registration',
        toEmail: input.email,
        variables: { signInUrl: `${await getAppUrl(org, 'web')}/sign-in` },
      });
    });
    return { created: false };
  }

  // Only a customer type that exists in this organisation, and only as a
  // *claim* — customerTypeConfirmedAt stays null until staff verify it, and
  // pricing ignores unconfirmed claims.
  let customerTypeId = null;
  if (input.customerTypeId) {
    const [ct] = await db
      .select({ id: customerTypes.id })
      .from(customerTypes)
      .where(
        and(
          eq(customerTypes.id, input.customerTypeId),
          eq(customerTypes.organisationId, org.id),
          eq(customerTypes.isActive, true),
        ),
      )
      .limit(1);
    customerTypeId = ct?.id ?? null;
  }

  const passwordHash = await hashPassword(input.password);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        organisationId: org.id,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone || null,
        hirerOrgName: input.hirerOrgName || null,
        hirerAbn: input.hirerAbn?.replace(/\s/g, '') || null,
        customerTypeId,
        addressLine1: input.addressLine1 || null,
        addressLine2: input.addressLine2 || null,
        suburb: input.suburb || null,
        state: input.state || null,
        postcode: input.postcode || null,
      })
      .returning();

    const verifyToken = randomToken();
    await tx.insert(authTokens).values({
      userId: user.id,
      kind: 'EMAIL_VERIFY',
      tokenHash: sha256(verifyToken),
      expiresAt: addHours(now(), 48),
    });

    await enqueueEmail(tx, {
      organisationId: org.id,
      templateCode: 'account.verify_email',
      toEmail: user.email,
      toName: `${user.firstName} ${user.lastName}`,
      userId: user.id,
      variables: {
        firstName: user.firstName,
        verifyUrl: `${await getAppUrl(org, 'web')}/verify-email?token=${verifyToken}`,
      },
    });

    const tokens = await buildTokens(tx, {
      user,
      organisationId: org.id,
      app: 'web',
      req,
    });
    return { created: true, user, tokens };
  });

  log.info({ userId: result.user.id }, 'Customer registered');
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.org
 * @param {'web'|'admin'} p.app
 */
export async function login({ org, app, input, req }) {
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.organisationId, org.id), eq(users.email, input.email), isNull(users.deletedAt)),
    )
    .limit(1);

  // verifyPassword spends the same time whether or not the hash exists, so the
  // response time does not reveal whether the address is registered.
  const ok = await verifyPassword(user?.passwordHash, input.password);
  if (!user || !ok) {
    log.warn({ email: input.email, app }, 'Failed sign-in');
    throw unauthorized('That email or password is not correct.');
  }
  if (user.blockedAt) throw forbidden('This account has been suspended. Please contact us.');

  if (app === 'admin' && !(await isStaff(db, user.id))) {
    // Do not confirm that the account exists — this is the admin panel.
    throw unauthorized('That email or password is not correct.');
  }

  const tokens = await db.transaction(async (tx) => {
    // Opportunistic upgrade if the hash parameters have since been raised.
    if (user.passwordHash && needsRehash(user.passwordHash)) {
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(input.password) })
        .where(eq(users.id, user.id));
    }
    await tx.update(users).set({ lastLoginAt: now() }).where(eq(users.id, user.id));
    return buildTokens(tx, { user, organisationId: org.id, app, req });
  });

  return { user, tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh — with reuse detection
// ─────────────────────────────────────────────────────────────────────────────

export async function refresh({ org, app, refreshToken, req }) {
  if (!refreshToken) throw unauthorized('Your session has expired. Please sign in again.');
  const hash = sha256(refreshToken);

  // The lookup and the reuse check happen OUTSIDE the transaction, on purpose.
  //
  // Revoking the session family is a security action that must survive the
  // rejection that follows it. Done inside the rotation transaction, the throw
  // would roll the revocation back — the attacker would be told "no" and keep
  // a live session, which is the opposite of what reuse detection is for.
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash), eq(sessions.app, app)))
    .limit(1);

  if (!session || session.organisationId !== org.id) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  // A token that has already been rotated is being presented again. Either it
  // was captured, or a client replayed an old one. Either way every session
  // descended from that login is now untrustworthy — including any the
  // attacker has already obtained by rotating it.
  if (session.replacedBy || session.revokedAt) {
    log.error(
      { userId: session.userId, familyId: session.familyId },
      'Refresh token reuse detected — revoking session family',
    );
    await db
      .update(sessions)
      .set({ revokedAt: now(), revokedReason: 'TOKEN_REUSE_DETECTED' })
      .where(and(eq(sessions.familyId, session.familyId), isNull(sessions.revokedAt)));
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  if (session.expiresAt <= now()) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  return db.transaction(async (tx) => {
    // Re-read under the transaction and assert the token has not been rotated
    // in the meantime, so two simultaneous refreshes cannot both succeed.
    const [fresh] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
      .limit(1)
      .for('update');
    if (!fresh) throw unauthorized('Your session has expired. Please sign in again.');

    const [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, fresh.userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw unauthorized('Your session has expired. Please sign in again.');
    if (user.blockedAt) throw forbidden('This account has been suspended.');

    const tokens = await buildTokens(tx, {
      user,
      organisationId: org.id,
      app,
      req,
      familyId: fresh.familyId,
    });

    // Rotate: mark the old session as replaced rather than deleting it, so the
    // reuse check above has something to find.
    await tx
      .update(sessions)
      .set({ replacedBy: tokens.sessionId ?? null, revokedAt: now(), revokedReason: 'ROTATED' })
      .where(eq(sessions.id, fresh.id));

    return { user, tokens };
  });
}

export async function logout({ app, refreshToken }) {
  if (!refreshToken) return;
  const [session] = await db
    .select({ familyId: sessions.familyId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(refreshToken)), eq(sessions.app, app)))
    .limit(1);
  if (!session) return;

  // Revoke the family, not just this token: signing out should end the session
  // on this device completely, including any rotation already in flight.
  await db
    .update(sessions)
    .set({ revokedAt: now(), revokedReason: 'LOGOUT' })
    .where(and(eq(sessions.familyId, session.familyId), isNull(sessions.revokedAt)));
}

/** Sign out everywhere — offered after a password change. */
export async function logoutAllSessions(userId, exceptSessionId) {
  await db
    .update(sessions)
    .set({ revokedAt: now(), revokedReason: 'LOGOUT_ALL' })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Email verification and password reset
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch and consume a single-use token in one atomic step. */
async function consumeToken(tx, { token, kind }) {
  const [row] = await tx
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.kind, kind),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, now()),
      ),
    )
    .limit(1);
  if (!row) throw conflict('That link is no longer valid. Please request a new one.');

  // Conditional update: if two requests arrive together only one updates a row.
  const updated = await tx
    .update(authTokens)
    .set({ consumedAt: now() })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.consumedAt)))
    .returning({ id: authTokens.id });
  if (!updated.length) throw conflict('That link has already been used.');

  return row;
}

export async function verifyEmail({ token }) {
  return db.transaction(async (tx) => {
    const row = await consumeToken(tx, { token, kind: 'EMAIL_VERIFY' });
    await tx
      .update(users)
      .set({ emailVerifiedAt: now() })
      .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)));
    return { verified: true };
  });
}

export async function resendVerification({ org, user }) {
  if (user.emailVerifiedAt) return { sent: false };
  await db.transaction(async (tx) => {
    const token = randomToken();
    await tx.insert(authTokens).values({
      userId: user.id,
      kind: 'EMAIL_VERIFY',
      tokenHash: sha256(token),
      expiresAt: addHours(now(), 48),
    });
    await enqueueEmail(tx, {
      organisationId: org.id,
      templateCode: 'account.verify_email',
      toEmail: user.email,
      toName: user.firstName,
      userId: user.id,
      variables: {
        firstName: user.firstName,
        verifyUrl: `${await getAppUrl(org, 'web')}/verify-email?token=${token}`,
      },
    });
  });
  return { sent: true };
}

export async function forgotPassword({ org, email }) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.organisationId, org.id), eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  // Always report success. "No account with that email" is an enumeration
  // oracle, and for a community organisation the membership list is sensitive.
  if (!user || user.blockedAt) {
    log.info({ email }, 'Password reset requested for unknown or blocked account');
    return { sent: true };
  }

  await db.transaction(async (tx) => {
    // Invalidate outstanding resets, so an older email in the inbox cannot be
    // used after a newer one has been requested.
    await tx
      .update(authTokens)
      .set({ consumedAt: now() })
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.kind, 'PASSWORD_RESET'),
          isNull(authTokens.consumedAt),
        ),
      );

    const token = randomToken();
    await tx.insert(authTokens).values({
      userId: user.id,
      kind: 'PASSWORD_RESET',
      tokenHash: sha256(token),
      expiresAt: addHours(now(), 2),
    });
    await enqueueEmail(tx, {
      organisationId: org.id,
      templateCode: 'account.password_reset',
      toEmail: user.email,
      toName: user.firstName,
      userId: user.id,
      variables: {
        firstName: user.firstName,
        resetUrl: `${await getAppUrl(org, 'web')}/reset-password?token=${token}`,
        expiryHours: 2,
      },
    });
  });

  return { sent: true };
}

export async function resetPassword({ token, password }) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const row = await consumeToken(tx, { token, kind: 'PASSWORD_RESET' });
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    // Every existing session is now suspect: the reset may have been needed
    // because someone else had access.
    await tx
      .update(sessions)
      .set({ revokedAt: now(), revokedReason: 'PASSWORD_RESET' })
      .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
    return { reset: true };
  });
}

export async function changePassword({ user, currentPassword, newPassword, keepSessionId }) {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!(await verifyPassword(row?.passwordHash, currentPassword))) {
    throw unauthorized('Your current password is not correct.');
  }
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    // Every other session is ended; the one making the change stays signed in,
    // because logging someone out of the tab they are typing in is hostile.
    await tx
      .update(sessions)
      .set({ revokedAt: now(), revokedReason: 'PASSWORD_CHANGED' })
      .where(
        and(
          eq(sessions.userId, user.id),
          isNull(sessions.revokedAt),
          keepSessionId ? notInArray(sessions.id, [keepSessionId]) : undefined,
        ),
      );
  });
  return { changed: true };
}

/** Remove expired sessions and tokens. Called by the hourly tick. */
export async function pruneExpiredAuthRows() {
  const cutoff = addDays(now(), -7);
  const deletedSessions = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, cutoff), lt(sessions.revokedAt, cutoff)))
    .returning({ id: sessions.id });
  const deletedTokens = await db
    .delete(authTokens)
    .where(or(lt(authTokens.expiresAt, cutoff), lt(authTokens.consumedAt, cutoff)))
    .returning({ id: authTokens.id });
  return { sessions: deletedSessions.length, tokens: deletedTokens.length };
}
