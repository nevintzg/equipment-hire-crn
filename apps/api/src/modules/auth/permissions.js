/**
 * The permission catalogue.
 *
 * Single source of truth: the seed inserts these rows, the role editor in the
 * admin panel renders them grouped, and requirePermission() references them
 * by code. Adding a capability means adding it here and running the seed —
 * never a hard-coded role check like `if (user.role === 'manager')`, which is
 * the thing that makes permissions impossible to change later.
 */
export const PERMISSIONS = {
  // Bookings
  'booking.view': { group: 'Bookings', description: 'View bookings' },
  'booking.create': { group: 'Bookings', description: 'Create a booking for a customer' },
  'booking.edit': { group: 'Bookings', description: 'Edit booking details' },
  'booking.approve': { group: 'Bookings', description: 'Approve or reject booking requests' },
  'booking.cancel': { group: 'Bookings', description: 'Cancel a booking' },
  'booking.handover': { group: 'Bookings', description: 'Record pickups and returns' },
  'booking.inspect': { group: 'Bookings', description: 'Complete return inspections' },
  'booking.allocate': { group: 'Bookings', description: 'Assign or swap specific units' },

  // Catalogue
  'equipment.view': { group: 'Equipment', description: 'View the equipment catalogue' },
  'equipment.create': { group: 'Equipment', description: 'Add equipment' },
  'equipment.edit': { group: 'Equipment', description: 'Edit equipment and pricing' },
  'equipment.delete': { group: 'Equipment', description: 'Archive or delete equipment' },
  'equipment.publish': { group: 'Equipment', description: 'Publish equipment to the website' },
  'category.manage': { group: 'Equipment', description: 'Manage categories and attributes' },

  // Inventory
  'inventory.view': { group: 'Inventory', description: 'View units and stock levels' },
  'inventory.manage': { group: 'Inventory', description: 'Manage units, locations and stock' },
  'maintenance.manage': { group: 'Inventory', description: 'Schedule and record maintenance' },
  'availability.manage': { group: 'Inventory', description: 'Block out dates and closures' },

  // Customers
  'customer.view': { group: 'Customers', description: 'View customer accounts' },
  'customer.edit': { group: 'Customers', description: 'Edit customer details' },
  'customer.verify': { group: 'Customers', description: 'Confirm customer types and evidence' },
  'customer.block': { group: 'Customers', description: 'Block or unblock a customer' },

  // Money
  'payment.view': { group: 'Finance', description: 'View payments and invoices' },
  'payment.record': { group: 'Finance', description: 'Record manual payments' },
  'payment.refund': { group: 'Finance', description: 'Issue refunds and release bonds' },
  'report.view': { group: 'Finance', description: 'View reports' },
  'report.export': { group: 'Finance', description: 'Export data' },

  // Website and communications
  'content.manage': { group: 'Website', description: 'Edit pages, home page and navigation' },
  'announcement.manage': { group: 'Website', description: 'Manage site announcements' },
  'email.manage': { group: 'Communications', description: 'Edit email templates' },
  'enquiry.manage': { group: 'Communications', description: 'Handle contact enquiries' },

  // Administration
  'settings.view': { group: 'Settings', description: 'View settings' },
  'settings.manage': { group: 'Settings', description: 'Change settings, branding and policies' },
  'staff.manage': { group: 'Settings', description: 'Invite staff and assign roles' },
  'role.manage': { group: 'Settings', description: 'Create roles and change permissions' },
  'terms.manage': { group: 'Settings', description: 'Publish terms and conditions' },
  'audit.view': { group: 'Settings', description: 'View the audit log' },
};

export const PERMISSION_CODES = Object.keys(PERMISSIONS);

/**
 * Default roles, matching the role matrix in the pages specification.
 *
 * OWNER holds '*' — a wildcard rather than an enumerated list, so that adding
 * a new permission never leaves the organisation's administrator unable to use
 * a feature they just enabled.
 */
export const DEFAULT_ROLES = [
  {
    code: 'OWNER',
    name: 'Owner',
    description: 'Full access, including settings, staff and billing.',
    permissions: ['*'],
    isSystem: true,
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Runs the hire operation day to day; cannot change roles or billing.',
    isSystem: true,
    permissions: PERMISSION_CODES.filter(
      (c) => !['role.manage', 'staff.manage', 'settings.manage'].includes(c),
    ),
  },
  {
    code: 'OPERATIONS',
    name: 'Operations',
    description: 'Shed and handover duties: pickups, returns, inspections, maintenance.',
    isSystem: true,
    permissions: [
      'booking.view',
      'booking.edit',
      'booking.handover',
      'booking.inspect',
      'booking.allocate',
      'equipment.view',
      'inventory.view',
      'inventory.manage',
      'maintenance.manage',
      'availability.manage',
      'customer.view',
    ],
  },
  {
    code: 'FINANCE',
    name: 'Finance',
    description: 'Payments, refunds, bonds and reporting.',
    isSystem: true,
    permissions: [
      'booking.view',
      'customer.view',
      'payment.view',
      'payment.record',
      'payment.refund',
      'report.view',
      'report.export',
      'equipment.view',
    ],
  },
  {
    code: 'CONTENT',
    name: 'Content editor',
    description: 'Website copy, images and announcements only.',
    isSystem: true,
    permissions: [
      'content.manage',
      'announcement.manage',
      'equipment.view',
      'equipment.edit',
      'category.manage',
      'enquiry.manage',
    ],
  },
];

/** Codes a customer-site token carries. Customers own their own data only. */
export const CUSTOMER_PERMISSIONS = [];
