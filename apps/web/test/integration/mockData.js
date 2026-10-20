/**
 * Fictional data returned by the fake API in the customer integration tests.
 *
 * Each object has the same shape as the real API response:
 *   GET /site                         → apps/api/src/modules/site/site.service.js
 *   GET /equipment/:slug              → getEquipmentBySlug in equipment.service.js
 *   GET /equipment/:slug/availability → getAvailabilityCalendar in equipment.service.js
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
  categories: [{ id: 'cat-tents', slug: 'tents', name: 'Tents' }],
  announcements: [],
  locations: [],
};

export const partyTent = {
  id: 'eq-1',
  slug: 'party-tent',
  name: 'Party Tent',
  summary: 'Fits 30 guests',
  description: null,
  categoryId: 'cat-tents',
  category: { id: 'cat-tents', slug: 'tents', name: 'Tents' },
  media: [],
  attributes: [],
  related: [],
  capacity: 5,
  maxPerBooking: null,
  bookingUnit: 'DAY',
  minHireUnits: 1,
  minNoticeDays: 0,
  pricing: {
    rates: [{ period: 'PER_DAY', amountCents: 4500, fromUnit: 1, maxChargeCents: null }],
    bondCents: 10000,
    tier: 'BASE',
  },
};

/**
 * Pretends to be the backend for GET requests. An unexpected path is an
 * error, so a test fails loudly if the page asks for something we did not plan.
 */
export function fakeGet(path) {
  if (path === '/site') return Promise.resolve(site);
  if (path === '/equipment/party-tent') return Promise.resolve(partyTent);
  if (path === '/equipment/party-tent/availability') return Promise.resolve({ days: [] });
  return Promise.reject(new Error(`No fake response for GET ${path}`));
}
