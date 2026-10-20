import { describe, it, expect } from 'vitest';
import { evaluateAutoApproval } from '#src/modules/bookings/auto-approval.js';

const booking = (overrides = {}) => ({
  totalDueCents: 5000,
  itemCount: 2,
  days: 2,
  noticeDays: 7,
  hasBondedItems: false,
  ...overrides,
});

const customer = (overrides = {}) => ({
  customerTypeId: null,
  customerTypeConfirmed: false,
  emailVerified: true,
  completedBookings: 0,
  overdueCount: 0,
  ...overrides,
});

const smallHires = {
  id: 'r1',
  name: 'Small verified hires',
  priority: 100,
  customerTypeId: null,
  categoryId: null,
  approve: true,
  conditions: { maxTotalCents: 10_000, maxItems: 5, maxDays: 3, requireVerifiedEmail: true },
};

describe('evaluateAutoApproval', () => {
  it('requires review when no rule matches', () => {
    const result = evaluateAutoApproval({ rules: [], booking: booking(), customer: customer() });
    expect(result.approved).toBe(false);
  });

  it('approves a booking that satisfies a rule', () => {
    const result = evaluateAutoApproval({
      rules: [smallHires],
      booking: booking(),
      customer: customer(),
    });
    expect(result.approved).toBe(true);
    expect(result.rule.id).toBe('r1');
  });

  it.each([
    ['too expensive', { totalDueCents: 10_001 }],
    ['too many items', { itemCount: 6 }],
    ['too long', { days: 4 }],
  ])('declines a booking that is %s', (_label, overrides) => {
    const result = evaluateAutoApproval({
      rules: [smallHires],
      booking: booking(overrides),
      customer: customer(),
    });
    expect(result.approved).toBe(false);
  });

  it('declines when the email is unverified', () => {
    const result = evaluateAutoApproval({
      rules: [smallHires],
      booking: booking(),
      customer: customer({ emailVerified: false }),
    });
    expect(result.approved).toBe(false);
  });

  /**
   * The safety valve staff rely on for the expensive gear. It has to beat
   * every rule, including one that would otherwise approve.
   */
  it('always requires review for a flagged item, whatever the rules say', () => {
    const result = evaluateAutoApproval({
      rules: [{ ...smallHires, conditions: {} }],
      booking: booking(),
      customer: customer(),
      anyItemRequiresReview: true,
    });
    expect(result.approved).toBe(false);
    expect(result.reason).toMatch(/always requires review/i);
  });

  it('lets a lower-priority deny rule carve an exception out of an allow rule', () => {
    const deny = {
      id: 'r0',
      name: 'Never auto-approve bonded gear',
      priority: 10,
      approve: false,
      customerTypeId: null,
      categoryId: null,
      conditions: {},
    };
    const result = evaluateAutoApproval({
      rules: [smallHires, deny],
      booking: booking(),
      customer: customer(),
    });
    expect(result.approved).toBe(false);
    expect(result.rule.id).toBe('r0'); // priority 10 beats 100
  });

  it('scopes a rule to a confirmed customer type', () => {
    const rule = { ...smallHires, customerTypeId: 'np' };
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking(),
        customer: customer({ customerTypeId: 'np', customerTypeConfirmed: true }),
      }).approved,
    ).toBe(true);

    // Unconfirmed claim: no rule match.
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking(),
        customer: customer({ customerTypeId: 'np', customerTypeConfirmed: false }),
      }).approved,
    ).toBe(false);
  });

  it('scopes a rule to a category in the basket', () => {
    const rule = { ...smallHires, categoryId: 'tables' };
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking(),
        customer: customer(),
        categoryIds: ['tables'],
      }).approved,
    ).toBe(true);
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking(),
        customer: customer(),
        categoryIds: ['audio'],
      }).approved,
    ).toBe(false);
  });

  it('declines a customer with an overdue history', () => {
    const rule = {
      ...smallHires,
      conditions: { ...smallHires.conditions, requireNoOverdueHistory: true },
    };
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking(),
        customer: customer({ overdueCount: 1 }),
      }).approved,
    ).toBe(false);
  });

  it('rewards repeat customers', () => {
    const rule = { ...smallHires, conditions: { minCompletedBookings: 3 } };
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking(),
        customer: customer({ completedBookings: 2 }),
      }).approved,
    ).toBe(false);
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking(),
        customer: customer({ completedBookings: 3 }),
      }).approved,
    ).toBe(true);
  });

  it('can exclude anything carrying a bond', () => {
    const rule = { ...smallHires, conditions: { excludeBondedItems: true } };
    expect(
      evaluateAutoApproval({
        rules: [rule],
        booking: booking({ hasBondedItems: true }),
        customer: customer(),
      }).approved,
    ).toBe(false);
  });

  it('ignores inactive rules', () => {
    const result = evaluateAutoApproval({
      rules: [{ ...smallHires, isActive: false }],
      booking: booking(),
      customer: customer(),
    });
    expect(result.approved).toBe(false);
  });
});
