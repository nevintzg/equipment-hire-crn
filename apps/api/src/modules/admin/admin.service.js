import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '#src/db/client.js';
import {
  bookings,
  categories,
  contactEnquiries,
  customerTypes,
  equipment,
  payments,
  userRoles,
  users,
} from '#src/db/schema/index.js';
import { conflict, notFound } from '#src/lib/errors.js';
import { paginated, toLimitOffset } from '#src/lib/pagination.js';
import { slugify } from '#src/lib/format.js';
import { localDayBounds, now } from '#src/lib/time.js';
import { DateTime } from 'luxon';
import { toPublicUser, logoutAllSessions } from '#src/modules/auth/auth.service.js';

/**
 * Back-office reads that do not belong to a single domain module: the
 * dashboard, the customer directory, enquiries and category maintenance.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The numbers a coordinator opens the panel to see. "Today" is the
 * organisation's local day, not the server's — a pickup at 8am Adelaide time
 * is still yesterday in UTC.
 */
export async function getDashboard({ org }) {
  const today = DateTime.now().setZone(org.timezone).toISODate();
  const { start, end } = localDayBounds(today, org.timezone);
  const monthStart = DateTime.now().setZone(org.timezone).startOf('month').toJSDate();
  const orgBookings = eq(bookings.organisationId, org.id);

  const [
    [{ pendingReview }],
    [{ awaitingPayment }],
    [{ overdue }],
    [{ onHire }],
    pickupsToday,
    returnsToday,
    [{ revenueCents }],
    [{ openEnquiries }],
    recent,
  ] = await Promise.all([
    db
      .select({ pendingReview: count() })
      .from(bookings)
      .where(and(orgBookings, eq(bookings.status, 'PENDING_REVIEW'))),
    db
      .select({ awaitingPayment: count() })
      .from(bookings)
      .where(and(orgBookings, eq(bookings.status, 'APPROVED'))),
    db
      .select({ overdue: count() })
      .from(bookings)
      .where(and(orgBookings, eq(bookings.status, 'PICKED_UP'), lt(bookings.endAt, now()))),
    db
      .select({ onHire: count() })
      .from(bookings)
      .where(and(orgBookings, eq(bookings.status, 'PICKED_UP'))),
    dayList(org, eq(bookings.status, 'CONFIRMED'), bookings.startAt, start, end),
    dayList(org, eq(bookings.status, 'PICKED_UP'), bookings.endAt, start, end),
    db
      .select({
        revenueCents: sql`COALESCE(SUM(${payments.hireAmountCents}), 0)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.organisationId, org.id),
          eq(payments.status, 'SUCCEEDED'),
          gte(payments.paidAt, monthStart),
        ),
      ),
    db
      .select({ openEnquiries: count() })
      .from(contactEnquiries)
      .where(and(eq(contactEnquiries.organisationId, org.id), isNull(contactEnquiries.handledAt))),
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        status: bookings.status,
        startAt: bookings.startAt,
        totalDueCents: bookings.totalDueCents,
        createdAt: bookings.createdAt,
        customerName: sql`${users.firstName} || ' ' || ${users.lastName}`,
      })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId))
      .where(orgBookings)
      .orderBy(desc(bookings.createdAt))
      .limit(8),
  ]);

  return {
    date: today,
    counts: {
      pendingReview: Number(pendingReview),
      awaitingPayment: Number(awaitingPayment),
      overdue: Number(overdue),
      onHire: Number(onHire),
      openEnquiries: Number(openEnquiries),
    },
    revenueThisMonthCents: Number(revenueCents),
    pickupsToday,
    returnsToday,
    recent,
  };
}

function dayList(org, statusFilter, column, start, end) {
  return db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      status: bookings.status,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      customerName: sql`${users.firstName} || ' ' || ${users.lastName}`,
      hirerOrgName: users.hirerOrgName,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(
      and(eq(bookings.organisationId, org.id), statusFilter, gte(column, start), lte(column, end)),
    )
    .orderBy(asc(column));
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────────

/** Accounts with no staff role. Staff are managed elsewhere. */
const isCustomer = sql`NOT EXISTS (SELECT 1 FROM ${userRoles} ur WHERE ur.user_id = ${users.id})`;

export async function listCustomers({ org, query }) {
  const { limit, offset } = toLimitOffset(query);
  const filters = [eq(users.organisationId, org.id), isNull(users.deletedAt), isCustomer];
  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(users.email, term),
        ilike(users.firstName, term),
        ilike(users.lastName, term),
        ilike(users.hirerOrgName, term),
      ),
    );
  }
  if (query.filter === 'UNCONFIRMED_TYPE') {
    filters.push(sql`${users.customerTypeId} IS NOT NULL`, isNull(users.customerTypeConfirmedAt));
  } else if (query.filter === 'BLOCKED') {
    filters.push(sql`${users.blockedAt} IS NOT NULL`);
  }
  const where = and(...filters);

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        hirerOrgName: users.hirerOrgName,
        customerTypeId: users.customerTypeId,
        customerTypeName: customerTypes.name,
        customerTypeConfirmedAt: users.customerTypeConfirmedAt,
        emailVerifiedAt: users.emailVerifiedAt,
        blockedAt: users.blockedAt,
        createdAt: users.createdAt,
        bookingCount: sql`(SELECT count(*) FROM ${bookings} b WHERE b.user_id = ${users.id})::int`,
      })
      .from(users)
      .leftJoin(customerTypes, eq(customerTypes.id, users.customerTypeId))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return paginated(rows, Number(total), query);
}

async function findCustomer(org, customerId, exec = db) {
  const [row] = await exec
    .select()
    .from(users)
    .where(and(eq(users.id, customerId), eq(users.organisationId, org.id), isNull(users.deletedAt)))
    .limit(1);
  if (!row) throw notFound('That customer could not be found.');
  return row;
}

export async function getCustomer({ org, customerId }) {
  const user = await findCustomer(org, customerId);
  const [type] = user.customerTypeId
    ? await db
        .select({ id: customerTypes.id, code: customerTypes.code, name: customerTypes.name })
        .from(customerTypes)
        .where(eq(customerTypes.id, user.customerTypeId))
        .limit(1)
    : [];
  const recentBookings = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      status: bookings.status,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      totalDueCents: bookings.totalDueCents,
    })
    .from(bookings)
    .where(eq(bookings.userId, user.id))
    .orderBy(desc(bookings.createdAt))
    .limit(25);

  return {
    ...toPublicUser(user, { customerType: type ?? null }),
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    staffNotes: user.staffNotes,
    lastLoginAt: user.lastLoginAt,
    bookings: recentBookings,
  };
}

export async function updateCustomer({ org, customerId, input, actor }) {
  return db
    .transaction(async (tx) => {
      const user = await findCustomer(org, customerId, tx);
      const set = {};

      if (input.customerTypeId !== undefined) {
        set.customerTypeId = input.customerTypeId;
        // Changing the type resets confirmation unless it is confirmed in the same call.
        if (input.customerTypeId !== user.customerTypeId) {
          set.customerTypeConfirmedAt = null;
          set.customerTypeConfirmedBy = null;
        }
      }
      if (input.confirmCustomerType === true) {
        set.customerTypeConfirmedAt = now();
        set.customerTypeConfirmedBy = actor.userId;
      } else if (input.confirmCustomerType === false) {
        set.customerTypeConfirmedAt = null;
        set.customerTypeConfirmedBy = null;
      }
      if (input.staffNotes !== undefined) set.staffNotes = input.staffNotes;
      if (input.blocked === true && !user.blockedAt) {
        set.blockedAt = now();
        set.blockedReason = input.blockedReason ?? null;
      } else if (input.blocked === false) {
        set.blockedAt = null;
        set.blockedReason = null;
      }

      if (!Object.keys(set).length) return user;
      const [updated] = await tx.update(users).set(set).where(eq(users.id, user.id)).returning();
      return updated;
    })
    .then(async (updated) => {
      // A blocked customer is signed out everywhere, after commit.
      if (input.blocked === true) await logoutAllSessions(updated.id);
      return getCustomer({ org, customerId });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Enquiries
// ─────────────────────────────────────────────────────────────────────────────

export async function listEnquiries({ org, query }) {
  const { limit, offset } = toLimitOffset(query);
  const filters = [eq(contactEnquiries.organisationId, org.id)];
  if (query.status === 'OPEN') filters.push(isNull(contactEnquiries.handledAt));
  if (query.status === 'HANDLED') filters.push(sql`${contactEnquiries.handledAt} IS NOT NULL`);
  const where = and(...filters);

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select()
      .from(contactEnquiries)
      .where(where)
      .orderBy(desc(contactEnquiries.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(contactEnquiries).where(where),
  ]);
  return paginated(
    rows.map(({ ipAddress: _ip, ...r }) => r),
    Number(total),
    query,
  );
}

export async function updateEnquiry({ org, enquiryId, input, actor }) {
  const [row] = await db
    .update(contactEnquiries)
    .set({
      handledAt: input.handled ? now() : null,
      handledBy: input.handled ? actor.userId : null,
      ...(input.staffNotes !== undefined ? { staffNotes: input.staffNotes } : {}),
    })
    .where(and(eq(contactEnquiries.id, enquiryId), eq(contactEnquiries.organisationId, org.id)))
    .returning();
  if (!row) throw notFound('That enquiry could not be found.');
  const { ipAddress: _ip, ...rest } = row;
  return rest;
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

export async function listCategories({ org }) {
  return db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      imageFileId: categories.imageFileId,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      equipmentCount: sql`(
        SELECT count(*) FROM ${equipment} e
        WHERE e.category_id = ${categories.id} AND e.deleted_at IS NULL
      )::int`,
    })
    .from(categories)
    .where(eq(categories.organisationId, org.id))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function saveCategory({ org, categoryId, input }) {
  return db.transaction(async (tx) => {
    const slug = input.slug || slugify(input.name);
    const [clash] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.organisationId, org.id), eq(categories.slug, slug)))
      .limit(1);
    if (clash && clash.id !== categoryId) {
      throw conflict('Another category already uses that web address.');
    }
    if (input.parentId && input.parentId === categoryId) {
      throw conflict('A category cannot be its own parent.');
    }

    const values = {
      name: input.name,
      slug,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      imageFileId: input.imageFileId ?? null,
    };

    if (!categoryId) {
      const [row] = await tx
        .insert(categories)
        .values({ organisationId: org.id, ...values })
        .returning();
      return row;
    }
    const [row] = await tx
      .update(categories)
      .set(values)
      .where(and(eq(categories.id, categoryId), eq(categories.organisationId, org.id)))
      .returning();
    if (!row) throw notFound('That category could not be found.');
    return row;
  });
}

/** Deactivate rather than delete: equipment keeps its category for history. */
export async function deactivateCategory({ org, categoryId }) {
  const [row] = await db
    .update(categories)
    .set({ isActive: false })
    .where(and(eq(categories.id, categoryId), eq(categories.organisationId, org.id)))
    .returning();
  if (!row) throw notFound('That category could not be found.');
  return row;
}

/** Used by the booking calendar view: everything that overlaps a window. */
export async function bookingsInWindow({ org, from, to }) {
  const start = localDayBounds(from, org.timezone).start;
  const end = localDayBounds(to, org.timezone).end;
  return db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      status: bookings.status,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      customerName: sql`${users.firstName} || ' ' || ${users.lastName}`,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(
      and(
        eq(bookings.organisationId, org.id),
        inArray(bookings.status, [
          'PENDING_REVIEW',
          'APPROVED',
          'CONFIRMED',
          'PICKED_UP',
          'RETURNED',
        ]),
        lt(bookings.startAt, end),
        gte(bookings.endAt, start),
      ),
    )
    .orderBy(asc(bookings.startAt));
}
