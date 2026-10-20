import { and, asc, desc, eq, isNull, lte, or, gte } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import {
  announcements,
  bookingQuestions,
  categories,
  homeSections,
  locationSlots,
  locations,
  navItems,
  organisationDomains,
  pages,
  termsVersions,
} from '#src/db/schema/index.js';
import { getPublicSettings } from '#src/modules/settings/settings.service.js';
import { env } from '#src/config/env.js';
import { notFound } from '#src/lib/errors.js';
import { now } from '#src/lib/time.js';

/**
 * Everything the public website needs that is not equipment: branding, pages,
 * navigation, announcements, terms.
 */

/**
 * The base URL for an organisation's frontend.
 *
 * Emails have to link somewhere, and in a multi-tenant deployment that is not
 * a constant: each organisation has its own hostname. Falls back to the
 * configured URL for local development, where no domain rows exist.
 *
 * `exec` MUST be the caller's transaction when this is called inside one.
 * Reaching for the global pool from inside a transaction takes a *second*
 * connection while the first is still held, and under concurrent load that
 * exhausts the pool and deadlocks: every in-flight transaction ends up waiting
 * for a connection that only another transaction can release.
 *
 * @param {{id: string}} org
 * @param {'web'|'admin'} app
 * @param {import('#src/db/client.js').Tx | typeof db} [exec]
 */
export async function getAppUrl(org, app = 'web', exec = db) {
  const [domain] = await exec
    .select({ hostname: organisationDomains.hostname })
    .from(organisationDomains)
    .where(
      and(
        eq(organisationDomains.organisationId, org.id),
        eq(organisationDomains.app, app),
        eq(organisationDomains.isPrimary, true),
      ),
    )
    .limit(1);

  if (domain) return `https://${domain.hostname}`;
  return app === 'admin' ? env.PUBLIC_ADMIN_URL : env.PUBLIC_WEB_URL;
}

/**
 * One payload the frontend fetches on boot: branding, navigation, categories,
 * any live announcement. Bundled deliberately — four round trips to a database
 * that may be cold-starting is a visibly slow first paint.
 */
export async function getPublicSite(org) {
  const [settingsValues, nav, cats, live, locs] = await Promise.all([
    getPublicSettings(org.id),

    db
      .select({
        id: navItems.id,
        placement: navItems.placement,
        label: navItems.label,
        href: navItems.href,
        parentId: navItems.parentId,
        opensInNewTab: navItems.opensInNewTab,
        sortOrder: navItems.sortOrder,
      })
      .from(navItems)
      .where(and(eq(navItems.organisationId, org.id), eq(navItems.isVisible, true)))
      .orderBy(asc(navItems.sortOrder)),

    db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        parentId: categories.parentId,
        imageFileId: categories.imageFileId,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(and(eq(categories.organisationId, org.id), eq(categories.isActive, true)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),

    db
      .select({
        id: announcements.id,
        message: announcements.message,
        level: announcements.level,
        isDismissible: announcements.isDismissible,
      })
      .from(announcements)
      .where(
        and(
          eq(announcements.organisationId, org.id),
          eq(announcements.isActive, true),
          or(isNull(announcements.startsAt), lte(announcements.startsAt, now())),
          or(isNull(announcements.endsAt), gte(announcements.endsAt, now())),
        ),
      )
      .orderBy(desc(announcements.createdAt))
      .limit(3),

    db
      .select({
        id: locations.id,
        name: locations.name,
        suburb: locations.suburb,
        state: locations.state,
        postcode: locations.postcode,
        accessNotes: locations.accessNotes,
        isDefault: locations.isDefault,
      })
      .from(locations)
      .where(and(eq(locations.organisationId, org.id), eq(locations.isActive, true)))
      .orderBy(desc(locations.isDefault), asc(locations.name)),
  ]);

  return {
    organisation: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      timezone: org.timezone,
      currency: org.currency,
      taxRateBp: org.taxRateBp,
    },
    settings: settingsValues,
    navigation: {
      header: nav.filter((n) => n.placement === 'HEADER'),
      footer: nav.filter((n) => n.placement === 'FOOTER'),
    },
    categories: cats,
    announcements: live,
    locations: locs,
  };
}

export async function getHomeSections(org) {
  return db
    .select()
    .from(homeSections)
    .where(and(eq(homeSections.organisationId, org.id), eq(homeSections.isVisible, true)))
    .orderBy(asc(homeSections.sortOrder));
}

export async function getPublishedPage(org, slug) {
  const [page] = await db
    .select({
      slug: pages.slug,
      title: pages.title,
      bodyMarkdown: pages.bodyMarkdown,
      metaTitle: pages.metaTitle,
      metaDescription: pages.metaDescription,
      updatedAt: pages.updatedAt,
    })
    .from(pages)
    .where(
      and(eq(pages.organisationId, org.id), eq(pages.slug, slug), eq(pages.status, 'PUBLISHED')),
    )
    .limit(1);
  if (!page) throw notFound('That page could not be found.');
  return page;
}

export async function getCurrentTerms(org) {
  const [terms] = await db
    .select({
      id: termsVersions.id,
      version: termsVersions.version,
      title: termsVersions.title,
      bodyMarkdown: termsVersions.bodyMarkdown,
      publishedAt: termsVersions.publishedAt,
    })
    .from(termsVersions)
    .where(and(eq(termsVersions.organisationId, org.id), eq(termsVersions.isCurrent, true)))
    .limit(1);
  return terms ?? null;
}

/** Checkout questions, used by the frontend to render the last step. */
export async function getBookingQuestions(org) {
  return db
    .select({
      id: bookingQuestions.id,
      code: bookingQuestions.code,
      label: bookingQuestions.label,
      helpText: bookingQuestions.helpText,
      type: bookingQuestions.type,
      options: bookingQuestions.options,
      isRequired: bookingQuestions.isRequired,
      categoryId: bookingQuestions.categoryId,
      sortOrder: bookingQuestions.sortOrder,
    })
    .from(bookingQuestions)
    .where(and(eq(bookingQuestions.organisationId, org.id), eq(bookingQuestions.isActive, true)))
    .orderBy(asc(bookingQuestions.sortOrder));
}

/** Pickup and return windows for a location, for the date picker. */
export async function getLocationSlots(org, locationId) {
  return db
    .select()
    .from(locationSlots)
    .where(
      and(
        eq(locationSlots.organisationId, org.id),
        locationId ? eq(locationSlots.locationId, locationId) : undefined,
        eq(locationSlots.isActive, true),
      ),
    )
    .orderBy(asc(locationSlots.weekday), asc(locationSlots.startTime));
}
