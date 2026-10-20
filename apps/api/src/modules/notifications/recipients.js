import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import {
  notificationRules,
  permissions as permissionsTable,
  rolePermissions,
  roles,
  userRoles,
  users,
} from '#src/db/schema/index.js';

/**
 * Who should be told about a staff-facing event.
 *
 * Resolved from permissions rather than a hard-coded list of addresses: the
 * people who should hear about a booking needing review are exactly the people
 * allowed to approve one. Add a new manager and they start getting the emails;
 * remove the permission and they stop.
 *
 * `exec` MUST be the caller's transaction when called inside one — see the
 * note on getAppUrl about nested connection acquisition deadlocking the pool.
 *
 * @param {string} organisationId
 * @param {string} permissionCode e.g. 'booking.approve'
 * @param {string} [eventCode] to pick up extraRecipients from the rule
 * @param {import('#src/db/client.js').Tx | typeof db} [exec]
 */
export async function staffRecipients(organisationId, permissionCode, eventCode, exec = db) {
  const rows = await exec
    .selectDistinct({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
    .where(
      and(
        eq(users.organisationId, organisationId),
        isNull(users.deletedAt),
        isNull(users.blockedAt),
        // Owners hold every permission implicitly.
        inArray(roles.code, ['OWNER']),
      ),
    );

  const byPermission = await exec
    .selectDistinct({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
    .where(
      and(
        eq(users.organisationId, organisationId),
        isNull(users.deletedAt),
        isNull(users.blockedAt),
        eq(permissionsTable.code, permissionCode),
      ),
    );

  const seen = new Map();
  for (const r of [...rows, ...byPermission]) seen.set(r.email, r);

  // Shared inboxes configured against the event, e.g. shed@community.org.au
  if (eventCode) {
    const [rule] = await exec
      .select({ extra: notificationRules.extraRecipients })
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.organisationId, organisationId),
          eq(notificationRules.eventCode, eventCode),
        ),
      )
      .limit(1);
    for (const email of rule?.extra ?? []) {
      if (!seen.has(email)) seen.set(email, { id: null, email, firstName: '', lastName: '' });
    }
  }

  return [...seen.values()];
}
