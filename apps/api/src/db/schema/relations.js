import { relations } from 'drizzle-orm';
import {
  authTokens,
  customerTypes,
  organisationDomains,
  organisations,
  rolePermissions,
  roles,
  permissions,
  sessions,
  userRoles,
  users,
} from './identity.js';
import {
  attributeDefinitions,
  categories,
  categoryAttributes,
  equipment,
  equipmentAttributeValues,
  equipmentMedia,
  equipmentPrices,
  files,
} from './catalogue.js';
import {
  availabilityBlocks,
  conditionLogs,
  equipmentUnits,
  locationSlots,
  locations,
  maintenanceRecords,
} from './inventory.js';
import {
  bookingAllocations,
  bookingAnswers,
  bookingItems,
  bookingQuestions,
  bookingStatusHistory,
  bookings,
  termsVersions,
} from './bookings.js';
import { bondDeductions, inspectionItems, inspections, payments, refunds } from './payments.js';
import { outboxMessages } from './config.js';

/**
 * Relations power the `with:` option in Drizzle's relational queries, which is
 * how the API loads a booking and its items, allocations, payments and history
 * in one round trip. That matters here: the database is on Neon's free tier
 * and every extra query pays the latency twice.
 */

export const organisationsRelations = relations(organisations, ({ many }) => ({
  domains: many(organisationDomains),
  users: many(users),
  roles: many(roles),
  customerTypes: many(customerTypes),
  categories: many(categories),
  equipment: many(equipment),
  locations: many(locations),
  bookings: many(bookings),
}));

export const organisationDomainsRelations = relations(organisationDomains, ({ one }) => ({
  organisation: one(organisations, {
    fields: [organisationDomains.organisationId],
    references: [organisations.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [users.organisationId],
    references: [organisations.id],
  }),
  customerType: one(customerTypes, {
    fields: [users.customerTypeId],
    references: [customerTypes.id],
  }),
  userRoles: many(userRoles),
  sessions: many(sessions),
  authTokens: many(authTokens),
  bookings: many(bookings),
}));

export const customerTypesRelations = relations(customerTypes, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [customerTypes.organisationId],
    references: [organisations.id],
  }),
  users: many(users),
  prices: many(equipmentPrices),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [roles.organisationId],
    references: [organisations.id],
  }),
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  user: one(users, { fields: [authTokens.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [categories.organisationId],
    references: [organisations.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_tree',
  }),
  children: many(categories, { relationName: 'category_tree' }),
  equipment: many(equipment),
  categoryAttributes: many(categoryAttributes),
}));

export const attributeDefinitionsRelations = relations(attributeDefinitions, ({ many }) => ({
  categoryAttributes: many(categoryAttributes),
  values: many(equipmentAttributeValues),
}));

export const categoryAttributesRelations = relations(categoryAttributes, ({ one }) => ({
  category: one(categories, {
    fields: [categoryAttributes.categoryId],
    references: [categories.id],
  }),
  attribute: one(attributeDefinitions, {
    fields: [categoryAttributes.attributeDefinitionId],
    references: [attributeDefinitions.id],
  }),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [equipment.organisationId],
    references: [organisations.id],
  }),
  category: one(categories, { fields: [equipment.categoryId], references: [categories.id] }),
  prices: many(equipmentPrices),
  media: many(equipmentMedia),
  attributeValues: many(equipmentAttributeValues),
  units: many(equipmentUnits),
  blocks: many(availabilityBlocks),
  bookingItems: many(bookingItems),
}));

export const equipmentPricesRelations = relations(equipmentPrices, ({ one }) => ({
  equipment: one(equipment, {
    fields: [equipmentPrices.equipmentId],
    references: [equipment.id],
  }),
  customerType: one(customerTypes, {
    fields: [equipmentPrices.customerTypeId],
    references: [customerTypes.id],
  }),
}));

export const equipmentMediaRelations = relations(equipmentMedia, ({ one }) => ({
  equipment: one(equipment, {
    fields: [equipmentMedia.equipmentId],
    references: [equipment.id],
  }),
  file: one(files, { fields: [equipmentMedia.fileId], references: [files.id] }),
}));

export const equipmentAttributeValuesRelations = relations(equipmentAttributeValues, ({ one }) => ({
  equipment: one(equipment, {
    fields: [equipmentAttributeValues.equipmentId],
    references: [equipment.id],
  }),
  attribute: one(attributeDefinitions, {
    fields: [equipmentAttributeValues.attributeDefinitionId],
    references: [attributeDefinitions.id],
  }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [locations.organisationId],
    references: [organisations.id],
  }),
  slots: many(locationSlots),
  units: many(equipmentUnits),
}));

export const locationSlotsRelations = relations(locationSlots, ({ one }) => ({
  location: one(locations, { fields: [locationSlots.locationId], references: [locations.id] }),
}));

export const equipmentUnitsRelations = relations(equipmentUnits, ({ one, many }) => ({
  equipment: one(equipment, { fields: [equipmentUnits.equipmentId], references: [equipment.id] }),
  location: one(locations, { fields: [equipmentUnits.locationId], references: [locations.id] }),
  blocks: many(availabilityBlocks),
  allocations: many(bookingAllocations),
  maintenance: many(maintenanceRecords),
  conditionLogs: many(conditionLogs),
}));

export const availabilityBlocksRelations = relations(availabilityBlocks, ({ one }) => ({
  equipment: one(equipment, {
    fields: [availabilityBlocks.equipmentId],
    references: [equipment.id],
  }),
  unit: one(equipmentUnits, {
    fields: [availabilityBlocks.unitId],
    references: [equipmentUnits.id],
  }),
  booking: one(bookings, { fields: [availabilityBlocks.bookingId], references: [bookings.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [bookings.organisationId],
    references: [organisations.id],
  }),
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  customerType: one(customerTypes, {
    fields: [bookings.customerTypeId],
    references: [customerTypes.id],
  }),
  pickupLocation: one(locations, {
    fields: [bookings.pickupLocationId],
    references: [locations.id],
    relationName: 'booking_pickup_location',
  }),
  returnLocation: one(locations, {
    fields: [bookings.returnLocationId],
    references: [locations.id],
    relationName: 'booking_return_location',
  }),
  termsVersion: one(termsVersions, {
    fields: [bookings.termsVersionId],
    references: [termsVersions.id],
  }),
  items: many(bookingItems),
  allocations: many(bookingAllocations),
  statusHistory: many(bookingStatusHistory),
  answers: many(bookingAnswers),
  payments: many(payments),
  refunds: many(refunds),
  inspection: one(inspections),
  blocks: many(availabilityBlocks),
  emails: many(outboxMessages),
}));

export const bookingItemsRelations = relations(bookingItems, ({ one, many }) => ({
  booking: one(bookings, { fields: [bookingItems.bookingId], references: [bookings.id] }),
  equipment: one(equipment, { fields: [bookingItems.equipmentId], references: [equipment.id] }),
  allocations: many(bookingAllocations),
  inspectionItems: many(inspectionItems),
}));

export const bookingAllocationsRelations = relations(bookingAllocations, ({ one }) => ({
  booking: one(bookings, { fields: [bookingAllocations.bookingId], references: [bookings.id] }),
  bookingItem: one(bookingItems, {
    fields: [bookingAllocations.bookingItemId],
    references: [bookingItems.id],
  }),
  unit: one(equipmentUnits, {
    fields: [bookingAllocations.unitId],
    references: [equipmentUnits.id],
  }),
  block: one(availabilityBlocks, {
    fields: [bookingAllocations.availabilityBlockId],
    references: [availabilityBlocks.id],
  }),
}));

export const bookingStatusHistoryRelations = relations(bookingStatusHistory, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingStatusHistory.bookingId],
    references: [bookings.id],
  }),
  actor: one(users, { fields: [bookingStatusHistory.actorUserId], references: [users.id] }),
}));

export const bookingQuestionsRelations = relations(bookingQuestions, ({ many }) => ({
  answers: many(bookingAnswers),
}));

export const bookingAnswersRelations = relations(bookingAnswers, ({ one }) => ({
  booking: one(bookings, { fields: [bookingAnswers.bookingId], references: [bookings.id] }),
  question: one(bookingQuestions, {
    fields: [bookingAnswers.questionId],
    references: [bookingQuestions.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  refunds: many(refunds),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
  booking: one(bookings, { fields: [refunds.bookingId], references: [bookings.id] }),
}));

export const inspectionsRelations = relations(inspections, ({ one, many }) => ({
  booking: one(bookings, { fields: [inspections.bookingId], references: [bookings.id] }),
  items: many(inspectionItems),
  deductions: many(bondDeductions),
}));

export const inspectionItemsRelations = relations(inspectionItems, ({ one }) => ({
  inspection: one(inspections, {
    fields: [inspectionItems.inspectionId],
    references: [inspections.id],
  }),
  bookingItem: one(bookingItems, {
    fields: [inspectionItems.bookingItemId],
    references: [bookingItems.id],
  }),
  unit: one(equipmentUnits, {
    fields: [inspectionItems.unitId],
    references: [equipmentUnits.id],
  }),
}));

export const bondDeductionsRelations = relations(bondDeductions, ({ one }) => ({
  inspection: one(inspections, {
    fields: [bondDeductions.inspectionId],
    references: [inspections.id],
  }),
  booking: one(bookings, { fields: [bondDeductions.bookingId], references: [bookings.id] }),
}));

export const termsVersionsRelations = relations(termsVersions, ({ many }) => ({
  bookings: many(bookings),
}));

export const filesRelations = relations(files, ({ one }) => ({
  organisation: one(organisations, {
    fields: [files.organisationId],
    references: [organisations.id],
  }),
  uploader: one(users, { fields: [files.uploadedBy], references: [users.id] }),
}));
