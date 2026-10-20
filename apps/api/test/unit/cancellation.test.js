import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CANCELLATION_TIERS,
  cancellationRefund,
} from '#src/modules/bookings/cancellation.js';

const startAt = new Date('2026-06-20T00:00:00Z');
const hoursBefore = (h) => new Date(startAt.getTime() - h * 3_600_000);

describe('cancellationRefund', () => {
  const args = {
    tiers: DEFAULT_CANCELLATION_TIERS,
    startAt,
    hirePaidCents: 10_000,
    bondPaidCents: 5000,
  };

  it('refunds the hire fee in full with plenty of notice', () => {
    const result = cancellationRefund({ ...args, cancelledAt: hoursBefore(200) });
    expect(result.hireRefundCents).toBe(10_000);
    expect(result.refundCents).toBe(15_000);
    expect(result.withheldCents).toBe(0);
  });

  it('refunds half at the middle tier', () => {
    const result = cancellationRefund({ ...args, cancelledAt: hoursBefore(100) });
    expect(result.hireRefundCents).toBe(5000);
    expect(result.withheldCents).toBe(5000);
  });

  it('refunds no hire fee at short notice', () => {
    const result = cancellationRefund({ ...args, cancelledAt: hoursBefore(10) });
    expect(result.hireRefundCents).toBe(0);
  });

  /**
   * The bond is a deposit against damage. Nothing has been hired, so there is
   * nothing to damage — it always comes back in full, at every tier.
   */
  it('always returns the bond in full, even with no notice', () => {
    for (const hours of [200, 100, 10, 0]) {
      const result = cancellationRefund({ ...args, cancelledAt: hoursBefore(hours) });
      expect(result.bondRefundCents, `${hours}h notice`).toBe(5000);
    }
  });

  it('withholds an administration fee on top of the percentage', () => {
    const tiers = [{ minHoursBefore: 48, refundPercent: 100, feeCents: 1500, label: 'With fee' }];
    const result = cancellationRefund({ ...args, tiers, cancelledAt: hoursBefore(72) });
    expect(result.hireRefundCents).toBe(8500);
    expect(result.feeCents).toBe(1500);
  });

  it('never withholds a fee larger than what was paid', () => {
    const tiers = [{ minHoursBefore: 0, refundPercent: 100, feeCents: 50_000, label: 'Huge fee' }];
    const result = cancellationRefund({ ...args, tiers, cancelledAt: hoursBefore(72) });
    expect(result.hireRefundCents).toBe(0);
    expect(result.feeCents).toBe(10_000);
  });

  it('refunds nothing on a booking that was never paid for', () => {
    const result = cancellationRefund({
      ...args,
      hirePaidCents: 0,
      bondPaidCents: 0,
      cancelledAt: hoursBefore(300),
    });
    expect(result.refundCents).toBe(0);
  });

  it('picks the most generous tier the notice qualifies for', () => {
    const result = cancellationRefund({ ...args, cancelledAt: hoursBefore(168) });
    expect(result.tier.minHoursBefore).toBe(168);
    expect(result.hireRefundCents).toBe(10_000);
  });

  it('treats a cancellation after the start date as no notice', () => {
    const result = cancellationRefund({
      ...args,
      cancelledAt: new Date(startAt.getTime() + 86_400_000),
    });
    expect(result.hireRefundCents).toBe(0);
    expect(result.bondRefundCents).toBe(5000);
  });
});
