/**
 * Fictional data returned by the fake API in the admin integration tests.
 *
 * Each object has the same shape as the real API response:
 *   GET /site            → apps/api/src/modules/site/site.service.js
 *   GET /admin/equipment → listEquipmentForAdmin in equipment.service.js,
 *                          wrapped by paginated() in apps/api/src/lib/pagination.js
 */

export const site = {
  organisation: {
    id: 'org-1',
    name: 'Community Hire SA',
    timezone: 'Australia/Adelaide',
    currency: 'AUD',
  },
  settings: {},
  navigation: { header: [], footer: [] },
  categories: [
    { id: 'cat-tents', slug: 'tents', name: 'Tents' },
    { id: 'cat-trailers', slug: 'trailers', name: 'Trailers' },
  ],
  announcements: [],
  locations: [],
};

export const allEquipment = [
  {
    id: 'eq-1',
    slug: 'party-tent',
    name: 'Party Tent',
    sku: 'TENT-01',
    status: 'PUBLISHED',
    inventoryMode: 'BULK',
    bulkQuantity: 5,
    bondCents: 10000,
    categoryId: 'cat-tents',
    updatedAt: '2026-10-01T00:00:00.000Z',
    unitCount: 0,
  },
  {
    id: 'eq-2',
    slug: 'box-trailer',
    name: 'Box Trailer',
    sku: 'TRL-01',
    status: 'DRAFT',
    inventoryMode: 'SERIALIZED',
    bulkQuantity: 0,
    bondCents: 25000,
    categoryId: 'cat-trailers',
    updatedAt: '2026-10-01T00:00:00.000Z',
    unitCount: 2,
  },
];

/** A booking waiting for staff review, with only the fields the dialogs use. */
export const pendingBooking = {
  id: 'bk-1',
  reference: 'EH-1001',
  status: 'PENDING_REVIEW',
  totalDueCents: 15000,
  staffNotes: null,
};

/** Pretends to be the backend for GET /site. */
export function fakeGet(path) {
  if (path === '/site') return Promise.resolve(site);
  return Promise.reject(new Error(`No fake response for GET ${path}`));
}

/**
 * Pretends to be the backend for GET /admin/equipment: returns only the rows
 * that match the status and search the page asked for, like the real server.
 */
export function fakeEquipmentList(path, query) {
  const rows = allEquipment.filter(
    (e) =>
      (!query.status || e.status === query.status) &&
      (!query.search || e.name.toLowerCase().includes(query.search.toLowerCase())),
  );
  return Promise.resolve({
    data: rows,
    meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1, hasMore: false },
  });
}
