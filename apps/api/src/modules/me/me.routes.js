import { Router } from 'express';
import { and, count, eq, inArray } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { bookings, customerTypes, users } from '#src/db/schema/index.js';
import { authenticate } from '#src/middleware/auth.js';
import { validate } from '#src/middleware/validate.js';
import { updateProfileSchema } from '#src/modules/auth/auth.schemas.js';
import { toPublicUser } from '#src/modules/auth/auth.service.js';
import { logoutAllSessions } from '#src/modules/auth/auth.service.js';

/** The signed-in customer's own account. */
export function createMeRouter() {
  const router = Router();
  router.use(authenticate('web'));

  router.get('/', async (req, res) => {
    const [customerType] = req.auth.user.customerTypeId
      ? await db
          .select({ id: customerTypes.id, code: customerTypes.code, name: customerTypes.name })
          .from(customerTypes)
          .where(eq(customerTypes.id, req.auth.user.customerTypeId))
          .limit(1)
      : [];

    const [stats] = await db
      .select({
        total: count(),
        active: db.$count(
          bookings,
          and(
            eq(bookings.userId, req.auth.userId),
            inArray(bookings.status, ['PENDING_REVIEW', 'APPROVED', 'CONFIRMED', 'PICKED_UP']),
          ),
        ),
      })
      .from(bookings)
      .where(eq(bookings.userId, req.auth.userId));

    res.json({
      data: {
        user: toPublicUser(req.auth.user, { customerType: customerType ?? null }),
        stats: {
          totalBookings: Number(stats?.total ?? 0),
          activeBookings: Number(stats?.active ?? 0),
        },
      },
    });
  });

  router.patch('/', validate({ body: updateProfileSchema }), async (req, res) => {
    const input = req.valid.body;
    const [updated] = await db
      .update(users)
      .set({
        firstName: input.firstName ?? req.auth.user.firstName,
        lastName: input.lastName ?? req.auth.user.lastName,
        phone: input.phone ?? undefined,
        hirerOrgName: input.hirerOrgName ?? undefined,
        hirerAbn: input.hirerAbn?.replace(/\s/g, '') ?? undefined,
        addressLine1: input.addressLine1 ?? undefined,
        addressLine2: input.addressLine2 ?? undefined,
        suburb: input.suburb ?? undefined,
        state: input.state ?? undefined,
        postcode: input.postcode ?? undefined,
      })
      .where(eq(users.id, req.auth.userId))
      .returning();
    res.json({ data: { user: toPublicUser(updated) } });
  });

  /** Sign out on every other device. */
  router.post('/sessions/revoke-others', async (req, res) => {
    await logoutAllSessions(req.auth.userId, req.auth.sessionId);
    res.json({ data: { message: 'You have been signed out everywhere else.' } });
  });

  return router;
}
