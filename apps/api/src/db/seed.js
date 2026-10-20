import { eq } from 'drizzle-orm';
import { db, closeDatabase } from './client.js';
import {
  attributeDefinitions,
  autoApprovalRules,
  availabilityBlocks,
  bookingQuestions,
  cancellationTiers,
  categories,
  categoryAttributes,
  customerTypes,
  emailTemplates,
  equipment,
  equipmentAttributeValues,
  equipmentPrices,
  equipmentUnits,
  homeSections,
  locationSlots,
  locations,
  navItems,
  organisationDomains,
  organisations,
  pages,
  permissions as permissionsTable,
  rolePermissions,
  roles,
  termsVersions,
  userRoles,
  users,
} from './schema/index.js';
import { PERMISSIONS, DEFAULT_ROLES } from '#src/modules/auth/permissions.js';
import { DEFAULT_TEMPLATES } from '#src/modules/notifications/default-templates.js';
import { DEFAULT_CANCELLATION_TIERS } from '#src/modules/bookings/cancellation.js';
import { DEFAULT_AUTO_APPROVAL_RULES } from '#src/modules/bookings/auto-approval.js';
import { seedDefaultSettings } from '#src/modules/settings/settings.service.js';
import { hashPassword } from '#src/lib/password.js';
import { env } from '#src/config/env.js';
import { isMain } from '#src/lib/is-main.js';

/**
 * Seed a working organisation.
 *
 * Idempotent — safe to run repeatedly against the same database, which is what
 * makes it usable as a "reset my dev environment" command and in CI. Every
 * insert either conflicts-do-nothing or looks the row up first.
 *
 * The demo data is deliberately realistic (a marquee with three units, 120
 * chairs as a bulk pool, a PA system with a bond) because that combination is
 * what exercises both inventory models and the bond flow.
 */

export async function seed({ slug = env.DEFAULT_ORG_SLUG, quiet = false } = {}) {
  const say = quiet ? () => {} : (...args) => console.log(...args);

  // ── Permissions are global ─────────────────────────────────────────────────
  await db
    .insert(permissionsTable)
    .values(
      Object.entries(PERMISSIONS).map(([code, meta]) => ({
        code,
        description: meta.description,
        group: meta.group,
      })),
    )
    .onConflictDoNothing({ target: permissionsTable.code });
  const allPermissions = await db.select().from(permissionsTable);
  say(`✓ ${allPermissions.length} permissions`);

  // ── Organisation ──────────────────────────────────────────────────────────
  let [org] = await db.select().from(organisations).where(eq(organisations.slug, slug)).limit(1);
  if (!org) {
    [org] = await db
      .insert(organisations)
      .values({
        slug,
        name: 'Riverbend Community Resource Centre',
        legalName: 'Riverbend Community Resource Centre Incorporated',
        abn: '12345678901',
        timezone: 'Australia/Adelaide',
        currency: 'AUD',
        taxRateBp: 1000,
        contactEmail: 'hire@riverbend.example.org',
        contactPhone: '(08) 8123 4567',
        addressLine1: '12 Community Way',
        suburb: 'Riverbend',
        state: 'SA',
        postcode: '5000',
      })
      .returning();
    say(`✓ organisation "${org.name}" (${org.slug})`);
  } else {
    say(`• organisation "${org.name}" already exists`);
  }

  await db
    .insert(organisationDomains)
    .values([
      { organisationId: org.id, hostname: `${slug}.localhost`, app: 'web', isPrimary: true },
      {
        organisationId: org.id,
        hostname: `admin.${slug}.localhost`,
        app: 'admin',
        isPrimary: true,
      },
    ])
    .onConflictDoNothing();

  await seedDefaultSettings(db, org.id);
  say('✓ settings');

  // ── Roles ─────────────────────────────────────────────────────────────────
  for (const def of DEFAULT_ROLES) {
    let [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.organisationId, org.id))
      .then((rows) => rows.filter((r) => r.code.toLowerCase() === def.code.toLowerCase()));

    if (!role) {
      [role] = await db
        .insert(roles)
        .values({
          organisationId: org.id,
          code: def.code,
          name: def.name,
          description: def.description,
          isSystem: def.isSystem,
        })
        .returning();
    }

    // OWNER holds the '*' wildcard in its token rather than rows here, so that
    // a permission added later is automatically available to the owner.
    if (!def.permissions.includes('*')) {
      const ids = allPermissions
        .filter((p) => def.permissions.includes(p.code))
        .map((p) => ({ roleId: role.id, permissionId: p.id }));
      if (ids.length) await db.insert(rolePermissions).values(ids).onConflictDoNothing();
    }
  }
  say(`✓ ${DEFAULT_ROLES.length} roles`);

  // ── Customer types ────────────────────────────────────────────────────────
  const typeDefs = [
    {
      code: 'RESIDENT',
      name: 'Local resident',
      description: 'Living in the council area.',
      requiresVerification: false,
      autoApprove: true,
      sortOrder: 1,
    },
    {
      code: 'NON_PROFIT',
      name: 'Community group or non-profit',
      description: 'Incorporated associations, clubs and charities.',
      requiresVerification: true,
      autoApprove: true,
      sortOrder: 2,
    },
    {
      code: 'SCHOOL',
      name: 'School or preschool',
      description: 'Government and independent schools.',
      requiresVerification: true,
      autoApprove: true,
      sortOrder: 3,
    },
    {
      code: 'BUSINESS',
      name: 'Business',
      description: 'Commercial hire at full rates.',
      requiresVerification: true,
      autoApprove: false,
      sortOrder: 4,
    },
  ];
  await db
    .insert(customerTypes)
    .values(typeDefs.map((t) => ({ ...t, organisationId: org.id })))
    .onConflictDoNothing();
  const types = await db
    .select()
    .from(customerTypes)
    .where(eq(customerTypes.organisationId, org.id));
  const typeId = (code) => types.find((t) => t.code.toLowerCase() === code.toLowerCase())?.id;
  say(`✓ ${types.length} customer types`);

  // ── Owner account ─────────────────────────────────────────────────────────
  const ownerEmail = env.SEED_OWNER_EMAIL ?? 'owner@example.org';
  let [owner] = await db
    .select()
    .from(users)
    .where(eq(users.email, ownerEmail))
    .then((rows) => rows.filter((u) => u.organisationId === org.id));

  if (!owner) {
    [owner] = await db
      .insert(users)
      .values({
        organisationId: org.id,
        email: ownerEmail,
        passwordHash: await hashPassword(env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!'),
        firstName: 'Dana',
        lastName: 'Menzies',
        phone: '0412 345 678',
        emailVerifiedAt: new Date(),
      })
      .returning();
    const ownerRole = await db
      .select()
      .from(roles)
      .where(eq(roles.organisationId, org.id))
      .then((rows) => rows.find((r) => r.code.toLowerCase() === 'owner'));
    await db
      .insert(userRoles)
      .values({ userId: owner.id, roleId: ownerRole.id })
      .onConflictDoNothing();
    say(`✓ owner account ${ownerEmail}`);
  } else {
    say(`• owner account ${ownerEmail} already exists`);
  }

  // A demo customer, so the team can log into the customer site immediately.
  let [customer] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'customer@example.org'))
    .then((rows) => rows.filter((u) => u.organisationId === org.id));
  if (!customer) {
    [customer] = await db
      .insert(users)
      .values({
        organisationId: org.id,
        email: 'customer@example.org',
        passwordHash: await hashPassword('CustomerPass123!'),
        firstName: 'Sam',
        lastName: 'Taylor',
        phone: '0423 456 789',
        hirerOrgName: 'Riverbend Netball Club',
        customerTypeId: typeId('NON_PROFIT'),
        customerTypeConfirmedAt: new Date(),
        customerTypeConfirmedBy: owner.id,
        emailVerifiedAt: new Date(),
        suburb: 'Riverbend',
        state: 'SA',
        postcode: '5000',
      })
      .returning();
    say('✓ demo customer customer@example.org');
  }

  // ── Location and handover windows ─────────────────────────────────────────
  let [depot] = await db
    .select()
    .from(locations)
    .where(eq(locations.organisationId, org.id))
    .limit(1);
  if (!depot) {
    [depot] = await db
      .insert(locations)
      .values({
        organisationId: org.id,
        name: 'Community Shed',
        addressLine1: '12 Community Way',
        suburb: 'Riverbend',
        state: 'SA',
        postcode: '5000',
        accessNotes: 'Enter via the rear laneway. Ring the bell at the roller door.',
        isDefault: true,
      })
      .returning();

    await db.insert(locationSlots).values([
      {
        organisationId: org.id,
        locationId: depot.id,
        weekday: 5,
        startTime: '16:00',
        endTime: '18:00',
        kind: 'PICKUP',
        capacity: 6,
      },
      {
        organisationId: org.id,
        locationId: depot.id,
        weekday: 6,
        startTime: '09:00',
        endTime: '12:00',
        kind: 'BOTH',
        capacity: 8,
      },
      {
        organisationId: org.id,
        locationId: depot.id,
        weekday: 1,
        startTime: '09:00',
        endTime: '11:00',
        kind: 'RETURN',
        capacity: 8,
      },
    ]);
    say('✓ location and handover windows');
  }

  // ── Categories and attributes ─────────────────────────────────────────────
  const categoryDefs = [
    {
      slug: 'marquees-shelter',
      name: 'Marquees and shelter',
      description: 'Marquees, gazebos and weather protection.',
      sortOrder: 1,
    },
    {
      slug: 'tables-seating',
      name: 'Tables and seating',
      description: 'Trestle tables, chairs and benches.',
      sortOrder: 2,
    },
    {
      slug: 'audio-visual',
      name: 'Audio and visual',
      description: 'PA systems, microphones and projectors.',
      sortOrder: 3,
    },
    {
      slug: 'catering',
      name: 'Catering and cooking',
      description: 'BBQs, urns and serving equipment.',
      sortOrder: 4,
    },
    {
      slug: 'sporting',
      name: 'Sporting equipment',
      description: 'Goals, nets and field marking.',
      sortOrder: 5,
    },
  ];
  await db
    .insert(categories)
    .values(categoryDefs.map((c) => ({ ...c, organisationId: org.id })))
    .onConflictDoNothing();
  const cats = await db.select().from(categories).where(eq(categories.organisationId, org.id));
  const catId = (s) => cats.find((c) => c.slug === s)?.id;
  say(`✓ ${cats.length} categories`);

  const attrDefs = [
    {
      code: 'footprint',
      label: 'Footprint',
      type: 'TEXT',
      unitLabel: 'm',
      isFilterable: false,
      showOnCard: true,
      sortOrder: 1,
    },
    {
      code: 'capacity_people',
      label: 'Seats or covers',
      type: 'NUMBER',
      unitLabel: 'people',
      isFilterable: true,
      showOnCard: true,
      sortOrder: 2,
    },
    {
      code: 'power_required',
      label: 'Mains power needed',
      type: 'BOOLEAN',
      isFilterable: true,
      showOnCard: false,
      sortOrder: 3,
    },
    {
      code: 'setup_people',
      label: 'People needed to set up',
      type: 'NUMBER',
      unitLabel: 'people',
      isFilterable: false,
      showOnCard: true,
      sortOrder: 4,
    },
    {
      code: 'indoor_outdoor',
      label: 'Suitable for',
      type: 'SELECT',
      options: ['Indoor', 'Outdoor', 'Both'],
      isFilterable: true,
      showOnCard: false,
      sortOrder: 5,
    },
  ];
  await db
    .insert(attributeDefinitions)
    .values(attrDefs.map((a) => ({ ...a, organisationId: org.id })))
    .onConflictDoNothing();
  const attrs = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.organisationId, org.id));
  say(`✓ ${attrs.length} attribute definitions`);

  if (catId('marquees-shelter')) {
    await db
      .insert(categoryAttributes)
      .values(
        attrs
          .filter((a) => ['footprint', 'setup_people', 'indoor_outdoor'].includes(a.code))
          .map((a, i) => ({
            categoryId: catId('marquees-shelter'),
            attributeDefinitionId: a.id,
            isRequired: a.code === 'footprint',
            sortOrder: i,
          })),
      )
      .onConflictDoNothing();
  }

  // ── Equipment ─────────────────────────────────────────────────────────────
  const equipmentDefs = [
    {
      slug: 'marquee-6x3',
      name: 'Marquee 6m × 3m',
      sku: 'MQ-6X3',
      categoryId: catId('marquees-shelter'),
      summary: 'Pop-up marquee with white walls. Covers about 18 square metres.',
      description:
        'A sturdy 6 × 3 metre pop-up marquee with four detachable walls and pegs.\n\nTakes two people about twenty minutes to put up. Not suitable for use in strong wind.',
      status: 'PUBLISHED',
      inventoryMode: 'SERIALIZED',
      bookingUnit: 'DAY',
      minHireUnits: 1,
      maxHireUnits: 14,
      turnaroundHours: 24,
      minNoticeDays: 2,
      bondCents: 10_000,
      replacementValueCents: 85_000,
      maxPerBooking: 2,
      weightKg: 42,
      dimensions: '6.0 × 3.0 × 2.4 m erected',
      safetyNotes: 'Must be pegged or weighted. Take it down if wind exceeds 30 km/h.',
      includedItems: '4 walls, 8 pegs, guy ropes, carry bag, instruction card',
      pickupInstructions:
        'Bring a vehicle with at least a 2 metre load space, and a second pair of hands.',
      units: ['MQ-001', 'MQ-002', 'MQ-003'],
      prices: [
        { tierKind: 'BASE', period: 'PER_DAY', amountCents: 6000, fromUnit: 1 },
        { tierKind: 'BASE', period: 'PER_DAY', amountCents: 3500, fromUnit: 3 },
        {
          tierKind: 'CUSTOMER_TYPE',
          customerTypeId: typeId('NON_PROFIT'),
          period: 'PER_DAY',
          amountCents: 2500,
          fromUnit: 1,
        },
        {
          tierKind: 'CUSTOMER_TYPE',
          customerTypeId: typeId('RESIDENT'),
          period: 'PER_DAY',
          amountCents: 4000,
          fromUnit: 1,
        },
      ],
      attributes: { footprint: '6 × 3 m', setup_people: 2, indoor_outdoor: 'Outdoor' },
    },
    {
      slug: 'trestle-table',
      name: 'Trestle table (1.8 m)',
      sku: 'TB-180',
      categoryId: catId('tables-seating'),
      summary: 'Folding trestle table, seats six to eight.',
      status: 'PUBLISHED',
      inventoryMode: 'BULK',
      bulkQuantity: 24,
      bookingUnit: 'DAY',
      minHireUnits: 1,
      turnaroundHours: 0,
      minNoticeDays: 1,
      bondCents: 0,
      maxPerBooking: 12,
      weightKg: 11,
      dimensions: '1.8 × 0.75 m',
      includedItems: 'Table only — bring your own cloth',
      prices: [
        { tierKind: 'BASE', period: 'PER_DAY', amountCents: 800, fromUnit: 1 },
        {
          tierKind: 'CUSTOMER_TYPE',
          customerTypeId: typeId('NON_PROFIT'),
          period: 'PER_DAY',
          amountCents: 0,
          fromUnit: 1,
        },
      ],
      attributes: { capacity_people: 8, indoor_outdoor: 'Both' },
    },
    {
      slug: 'folding-chair',
      name: 'Folding chair',
      sku: 'CH-STD',
      categoryId: catId('tables-seating'),
      summary: 'Stackable folding chair. Hired in any quantity up to 120.',
      status: 'PUBLISHED',
      inventoryMode: 'BULK',
      bulkQuantity: 120,
      bookingUnit: 'DAY',
      minHireUnits: 1,
      minNoticeDays: 1,
      bondCents: 0,
      maxPerBooking: 120,
      prices: [
        { tierKind: 'BASE', period: 'PER_DAY', amountCents: 150, fromUnit: 1 },
        {
          tierKind: 'CUSTOMER_TYPE',
          customerTypeId: typeId('NON_PROFIT'),
          period: 'PER_DAY',
          amountCents: 0,
          fromUnit: 1,
        },
      ],
      attributes: { indoor_outdoor: 'Both' },
    },
    {
      slug: 'pa-system-portable',
      name: 'Portable PA system',
      sku: 'AV-PA1',
      categoryId: catId('audio-visual'),
      summary: 'Battery-powered speaker with two wireless microphones.',
      description:
        'A self-contained PA that runs about six hours on a charge. Two handheld wireless microphones, a 3.5 mm input and Bluetooth.',
      status: 'PUBLISHED',
      inventoryMode: 'SERIALIZED',
      bookingUnit: 'DAY',
      minHireUnits: 1,
      maxHireUnits: 7,
      turnaroundHours: 12,
      minNoticeDays: 3,
      bondCents: 15_000,
      replacementValueCents: 120_000,
      maxPerBooking: 1,
      requiresInduction: true,
      alwaysRequiresReview: true,
      safetyNotes: 'Keep dry. Charge fully before returning.',
      includedItems: '2 wireless microphones, charger, 3.5 mm cable, dust cover',
      units: ['PA-001', 'PA-002'],
      prices: [
        { tierKind: 'BASE', period: 'PER_DAY', amountCents: 8500, fromUnit: 1 },
        {
          tierKind: 'CUSTOMER_TYPE',
          customerTypeId: typeId('NON_PROFIT'),
          period: 'PER_DAY',
          amountCents: 4000,
          fromUnit: 1,
        },
      ],
      attributes: { power_required: false, setup_people: 1, indoor_outdoor: 'Both' },
    },
    {
      slug: 'gas-bbq-trailer',
      name: 'Gas BBQ trailer',
      sku: 'CT-BBQ1',
      categoryId: catId('catering'),
      summary: 'Twin-burner BBQ on a trailer. Towing licence and vehicle required.',
      status: 'PUBLISHED',
      inventoryMode: 'SERIALIZED',
      bookingUnit: 'DAY',
      minHireUnits: 1,
      maxHireUnits: 3,
      turnaroundHours: 24,
      minNoticeDays: 5,
      bondCents: 20_000,
      replacementValueCents: 450_000,
      maxPerBooking: 1,
      requiresLicence: true,
      requiresTowing: true,
      alwaysRequiresReview: true,
      safetyNotes:
        'Gas bottle supplied empty — arrange your own refill. Clean plates before return.',
      units: ['BBQ-001'],
      prices: [
        { tierKind: 'BASE', period: 'PER_DAY', amountCents: 12_000, fromUnit: 1 },
        {
          tierKind: 'CUSTOMER_TYPE',
          customerTypeId: typeId('NON_PROFIT'),
          period: 'PER_DAY',
          amountCents: 6000,
          fromUnit: 1,
        },
      ],
      attributes: {
        capacity_people: 150,
        power_required: false,
        setup_people: 2,
        indoor_outdoor: 'Outdoor',
      },
    },
    {
      slug: 'portable-netball-goals',
      name: 'Portable netball goals (pair)',
      sku: 'SP-NG1',
      categoryId: catId('sporting'),
      summary: 'Pair of weighted portable goals with nets.',
      status: 'PUBLISHED',
      inventoryMode: 'SERIALIZED',
      bookingUnit: 'DAY',
      minHireUnits: 1,
      maxHireUnits: 30,
      turnaroundHours: 0,
      minNoticeDays: 2,
      bondCents: 5000,
      maxPerBooking: 1,
      units: ['NG-001', 'NG-002'],
      prices: [
        { tierKind: 'BASE', period: 'WEEKEND', amountCents: 4500, fromUnit: 1 },
        {
          tierKind: 'CUSTOMER_TYPE',
          customerTypeId: typeId('SCHOOL'),
          period: 'WEEKEND',
          amountCents: 0,
          fromUnit: 1,
        },
      ],
      attributes: { indoor_outdoor: 'Both', setup_people: 2 },
    },
  ];

  for (const def of equipmentDefs) {
    const { units: unitTags, prices, attributes, ...fields } = def;
    let [item] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.slug, def.slug))
      .then((rows) => rows.filter((r) => r.organisationId === org.id));

    if (!item) {
      [item] = await db
        .insert(equipment)
        .values({ ...fields, organisationId: org.id, publishedAt: new Date() })
        .returning();

      if (unitTags?.length) {
        await db.insert(equipmentUnits).values(
          unitTags.map((assetTag) => ({
            organisationId: org.id,
            equipmentId: item.id,
            assetTag,
            locationId: depot.id,
            status: 'AVAILABLE',
            condition: 'GOOD',
          })),
        );
      }

      if (prices?.length) {
        await db
          .insert(equipmentPrices)
          .values(
            prices
              .filter((p) => p.tierKind === 'BASE' || p.customerTypeId)
              .map((p) => ({ ...p, organisationId: org.id, equipmentId: item.id })),
          );
      }

      if (attributes) {
        const rows = Object.entries(attributes)
          .map(([code, value]) => {
            const def2 = attrs.find((a) => a.code.toLowerCase() === code.toLowerCase());
            if (!def2) return null;
            return {
              equipmentId: item.id,
              attributeDefinitionId: def2.id,
              valueText: typeof value === 'string' ? value : null,
              valueNumber: typeof value === 'number' ? value : null,
              valueBool: typeof value === 'boolean' ? value : null,
            };
          })
          .filter(Boolean);
        if (rows.length)
          await db.insert(equipmentAttributeValues).values(rows).onConflictDoNothing();
      }
    }
  }
  const equipmentCount = await db
    .select()
    .from(equipment)
    .where(eq(equipment.organisationId, org.id));
  say(`✓ ${equipmentCount.length} equipment items`);

  // ── Policies ──────────────────────────────────────────────────────────────
  await db
    .insert(cancellationTiers)
    .values(DEFAULT_CANCELLATION_TIERS.map((t) => ({ ...t, organisationId: org.id })))
    .onConflictDoNothing();

  const existingRules = await db
    .select()
    .from(autoApprovalRules)
    .where(eq(autoApprovalRules.organisationId, org.id));
  if (!existingRules.length) {
    await db.insert(autoApprovalRules).values(
      DEFAULT_AUTO_APPROVAL_RULES.filter((r) => r.isActive).map((r) => ({
        organisationId: org.id,
        name: r.name,
        priority: r.priority,
        approve: r.approve,
        conditions: r.conditions,
        isActive: true,
      })),
    );
  }
  say('✓ cancellation and auto-approval policies');

  // ── Terms ─────────────────────────────────────────────────────────────────
  const existingTerms = await db
    .select()
    .from(termsVersions)
    .where(eq(termsVersions.organisationId, org.id));
  if (!existingTerms.length) {
    await db.insert(termsVersions).values({
      organisationId: org.id,
      version: 1,
      title: 'Terms of hire',
      isCurrent: true,
      publishedAt: new Date(),
      bodyMarkdown: `## Terms of hire

1. **Who may hire.** Equipment is hired to the individual named on the booking, who is responsible for it, even when hiring on behalf of a group.
2. **Collection and return.** Equipment must be collected and returned within the booked window. Late returns may attract a fee.
3. **Condition.** Equipment is checked before collection and again on return. You are responsible for loss or damage beyond fair wear and tear.
4. **Bond.** Where a bond applies it is refunded within five working days of a satisfactory return inspection.
5. **Cancellation.** Refunds follow our published cancellation schedule.
6. **Safety.** Follow the safety notes supplied with each item. Do not modify equipment or use it beyond its rated capacity.
7. **Cleaning.** Return equipment clean and dry. A cleaning fee may be deducted from the bond.
8. **Liability.** You are responsible for the safe use of hired equipment and for any injury or damage arising from its use.`,
    });
    say('✓ terms of hire v1');
  }

  // ── Email templates ───────────────────────────────────────────────────────
  await db
    .insert(emailTemplates)
    .values(
      DEFAULT_TEMPLATES.map((t) => ({
        organisationId: org.id,
        code: t.code,
        name: t.name,
        subject: t.subject,
        bodyMarkdown: t.bodyMarkdown,
        availableVariables: t.availableVariables,
      })),
    )
    .onConflictDoNothing();
  say(`✓ ${DEFAULT_TEMPLATES.length} email templates`);

  // ── Checkout questions ────────────────────────────────────────────────────
  await db
    .insert(bookingQuestions)
    .values([
      {
        organisationId: org.id,
        code: 'event_type',
        label: 'What is the equipment for?',
        helpText: 'For example: school fete, community BBQ, sports carnival.',
        type: 'TEXT',
        isRequired: true,
        sortOrder: 1,
      },
      {
        organisationId: org.id,
        code: 'site_access',
        label: 'Is there vehicle access at your site?',
        type: 'SELECT',
        options: [
          'Yes, right up to the location',
          'Partial — some carrying needed',
          'No vehicle access',
        ],
        isRequired: true,
        sortOrder: 2,
      },
      {
        organisationId: org.id,
        code: 'helpers',
        label: 'How many people will help set up?',
        type: 'NUMBER',
        isRequired: false,
        sortOrder: 3,
      },
      {
        organisationId: org.id,
        code: 'insurance',
        label: 'Does your group hold public liability insurance?',
        type: 'CHECKBOX',
        isRequired: false,
        sortOrder: 4,
      },
    ])
    .onConflictDoNothing();
  say('✓ checkout questions');

  // ── Website content ───────────────────────────────────────────────────────
  await db
    .insert(pages)
    .values([
      {
        organisationId: org.id,
        slug: 'about',
        title: 'About our hire service',
        status: 'PUBLISHED',
        isSystem: true,
        publishedAt: new Date(),
        bodyMarkdown:
          '## About us\n\nWe keep a shed full of equipment so local groups do not each have to buy their own. Everything here is available to residents, community groups, schools and local businesses.\n\nOur rates are lower for community groups and schools, and some items are free for them entirely.',
      },
      {
        organisationId: org.id,
        slug: 'how-it-works',
        title: 'How hiring works',
        status: 'PUBLISHED',
        isSystem: true,
        publishedAt: new Date(),
        bodyMarkdown:
          '## How it works\n\n1. **Browse and check dates.** Every item shows a calendar of what is free.\n2. **Send a request.** Add what you need to your basket and tell us about your event.\n3. **We review it.** Most small hires are approved automatically. Larger ones are checked by a staff member, usually within one working day.\n4. **Pay to confirm.** Once approved, pay the hire fee and any bond to lock in your dates.\n5. **Collect and return.** Come to the shed during our opening hours. We will check the equipment with you.',
      },
      {
        organisationId: org.id,
        slug: 'faq',
        title: 'Frequently asked questions',
        status: 'PUBLISHED',
        isSystem: true,
        publishedAt: new Date(),
        bodyMarkdown:
          '## Questions we are often asked\n\n**Do I need insurance?**\nNot for most items, but we ask so we know what you have.\n\n**What is the bond for?**\nIt covers loss or damage. It comes back in full when equipment is returned in good order.\n\n**Can someone else collect for me?**\nYes, as long as you tell us who in advance.',
      },
      {
        organisationId: org.id,
        slug: 'contact',
        title: 'Contact us',
        status: 'PUBLISHED',
        isSystem: true,
        publishedAt: new Date(),
        bodyMarkdown:
          '## Get in touch\n\nThe shed is open Friday afternoons and Saturday mornings. Outside those times, use the form on this page or leave us a message.',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(navItems)
    .values([
      {
        organisationId: org.id,
        placement: 'HEADER',
        label: 'Browse equipment',
        href: '/equipment',
        sortOrder: 1,
      },
      {
        organisationId: org.id,
        placement: 'HEADER',
        label: 'How it works',
        href: '/how-it-works',
        sortOrder: 2,
      },
      { organisationId: org.id, placement: 'HEADER', label: 'About', href: '/about', sortOrder: 3 },
      {
        organisationId: org.id,
        placement: 'HEADER',
        label: 'Contact',
        href: '/contact',
        sortOrder: 4,
      },
      {
        organisationId: org.id,
        placement: 'FOOTER',
        label: 'Terms of hire',
        href: '/terms',
        sortOrder: 1,
      },
      {
        organisationId: org.id,
        placement: 'FOOTER',
        label: 'Frequently asked questions',
        href: '/faq',
        sortOrder: 2,
      },
    ])
    .onConflictDoNothing();

  const existingSections = await db
    .select()
    .from(homeSections)
    .where(eq(homeSections.organisationId, org.id));
  if (!existingSections.length) {
    await db.insert(homeSections).values([
      {
        organisationId: org.id,
        kind: 'HERO',
        heading: 'Borrow what you need for your next community event',
        subheading:
          'Marquees, tables, sound systems and more — shared across our community so nobody has to buy their own.',
        ctaLabel: 'Browse equipment',
        ctaHref: '/equipment',
        sortOrder: 1,
      },
      { organisationId: org.id, kind: 'CATEGORY_GRID', heading: 'What we have', sortOrder: 2 },
      {
        organisationId: org.id,
        kind: 'STEPS',
        heading: 'How hiring works',
        config: {
          steps: [
            'Check what is free',
            'Send a request',
            'Pay to confirm',
            'Collect from the shed',
          ],
        },
        sortOrder: 3,
      },
      {
        organisationId: org.id,
        kind: 'CTA',
        heading: 'Not sure what you need?',
        subheading: 'Tell us about your event and we will suggest what might help.',
        ctaLabel: 'Get in touch',
        ctaHref: '/contact',
        sortOrder: 4,
      },
    ]);
  }
  say('✓ website pages, navigation and home page');

  // ── A maintenance block, so the calendar is not empty ──────────────────────
  const [paUnit] = await db
    .select()
    .from(equipmentUnits)
    .where(eq(equipmentUnits.assetTag, 'PA-002'))
    .limit(1);
  if (paUnit) {
    const from = new Date(Date.now() + 7 * 86_400_000);
    const to = new Date(Date.now() + 10 * 86_400_000);
    await db
      .insert(availabilityBlocks)
      .values({
        organisationId: org.id,
        equipmentId: paUnit.equipmentId,
        unitId: paUnit.id,
        quantity: 1,
        period: `[${from.toISOString()},${to.toISOString()})`,
        reason: 'MAINTENANCE',
        note: 'Annual test and tag',
      })
      .onConflictDoNothing();
  }

  say('\nSeed complete.');
  say(`  Customer site : http://localhost:5173  (customer@example.org / CustomerPass123!)`);
  say(
    `  Admin panel   : http://localhost:5174  (${ownerEmail} / ${env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!'})`,
  );
  return { org, owner, customer };
}

if (isMain(import.meta.url)) {
  seed()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await closeDatabase();
      process.exit(1);
    });
}
