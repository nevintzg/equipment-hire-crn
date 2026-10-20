/**
 * Auto-approval.
 *
 * The client's staff are volunteers; making them click "approve" on a resident
 * borrowing two trestle tables is how a system gets abandoned. But blanket
 * auto-approval is how a marquee goes missing. So rules are explicit, ordered,
 * and evaluated here as a pure function — no database, no side effects — which
 * means the policy can be unit-tested against every edge the client worries
 * about.
 *
 * Rules are tried in priority order; the first match decides. A matching rule
 * with approve=false is an explicit "always review this", which is how an
 * organisation carves an exception out of a broader allow rule.
 */

/**
 * @typedef {object} Rule
 * @property {string} id
 * @property {string} name
 * @property {number} priority
 * @property {string|null} customerTypeId
 * @property {string|null} categoryId
 * @property {boolean} approve
 * @property {Record<string, unknown>} conditions
 */

/**
 * @param {object} p
 * @param {Rule[]} p.rules
 * @param {object} p.booking      { totalDueCents, itemCount, days, noticeDays, hasBondedItems }
 * @param {object} p.customer     { customerTypeId, customerTypeConfirmed, emailVerified,
 *                                  completedBookings, overdueCount }
 * @param {string[]} p.categoryIds categories present in the basket
 * @param {boolean} p.anyItemRequiresReview equipment flagged alwaysRequiresReview
 * @returns {{approved: boolean, rule: Rule|null, reason: string}}
 */
export function evaluateAutoApproval({
  rules,
  booking,
  customer,
  categoryIds = [],
  anyItemRequiresReview = false,
}) {
  // An item flagged for mandatory review overrides every rule. This is the
  // escape hatch staff use for the expensive or dangerous gear.
  if (anyItemRequiresReview) {
    return {
      approved: false,
      rule: null,
      reason: 'An item in this booking always requires review.',
    };
  }

  const ordered = [...(rules ?? [])]
    .filter((r) => r.isActive !== false)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    if (!matches(rule, { booking, customer, categoryIds })) continue;
    return rule.approve
      ? { approved: true, rule, reason: `Matched rule "${rule.name}".` }
      : { approved: false, rule, reason: `Rule "${rule.name}" requires manual review.` };
  }

  return { approved: false, rule: null, reason: 'No auto-approval rule matched.' };
}

function matches(rule, { booking, customer, categoryIds }) {
  // Scope: a rule may be restricted to a customer type and/or a category.
  if (rule.customerTypeId) {
    if (!customer.customerTypeConfirmed) return false;
    if (customer.customerTypeId !== rule.customerTypeId) return false;
  }
  if (rule.categoryId && !categoryIds.includes(rule.categoryId)) return false;

  const c = rule.conditions ?? {};

  if (c.maxTotalCents != null && booking.totalDueCents > c.maxTotalCents) return false;
  if (c.maxItems != null && booking.itemCount > c.maxItems) return false;
  if (c.maxDays != null && booking.days > c.maxDays) return false;
  if (c.minNoticeDays != null && booking.noticeDays < c.minNoticeDays) return false;
  if (c.excludeBondedItems && booking.hasBondedItems) return false;

  if (c.requireVerifiedEmail && !customer.emailVerified) return false;
  if (c.requireConfirmedCustomerType && !customer.customerTypeConfirmed) return false;
  if (c.requireNoOverdueHistory && (customer.overdueCount ?? 0) > 0) return false;
  if (
    c.minCompletedBookings != null &&
    (customer.completedBookings ?? 0) < c.minCompletedBookings
  ) {
    return false;
  }

  return true;
}

/** Sensible starting rules, seeded for a new organisation. */
export const DEFAULT_AUTO_APPROVAL_RULES = [
  {
    name: 'Never auto-approve high-value hires',
    priority: 10,
    approve: false,
    conditions: { maxTotalCents: 100_000_000 }, // matches everything…
    // …but only above the threshold, expressed as a deny rule the admin edits.
    note: 'Edit the value to set your own review threshold.',
    isActive: false,
  },
  {
    name: 'Small, short, verified hires',
    priority: 100,
    approve: true,
    conditions: {
      maxTotalCents: 10_000, // $100
      maxItems: 5,
      maxDays: 3,
      requireVerifiedEmail: true,
      requireNoOverdueHistory: true,
      excludeBondedItems: true,
    },
    isActive: true,
  },
  {
    name: 'Trusted repeat customers',
    priority: 200,
    approve: true,
    conditions: {
      minCompletedBookings: 3,
      requireVerifiedEmail: true,
      requireNoOverdueHistory: true,
      maxTotalCents: 50_000, // $500
    },
    isActive: true,
  },
];
