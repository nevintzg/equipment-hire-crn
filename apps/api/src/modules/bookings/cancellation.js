import { hoursBetween } from '#src/lib/time.js';

/**
 * Cancellation refunds.
 *
 * The bond is always returned in full on cancellation — nothing has been
 * hired, so there is nothing to damage. Only the hire fee is subject to the
 * notice schedule, and an administration fee can be withheld on top.
 *
 * Pure, so the client's policy can be changed in the admin panel and verified
 * by a test rather than by cancelling real bookings.
 */

/**
 * @param {object} p
 * @param {Array<{minHoursBefore: number, refundPercent: number, feeCents: number, label: string}>} p.tiers
 * @param {Date} p.startAt      when the hire was due to start
 * @param {Date} p.cancelledAt
 * @param {number} p.hirePaidCents hire fee actually received
 * @param {number} p.bondPaidCents bond actually received
 * @returns {{refundCents: number, hireRefundCents: number, bondRefundCents: number,
 *            withheldCents: number, feeCents: number, tier: object|null, explanation: string}}
 */
export function cancellationRefund({
  tiers,
  startAt,
  cancelledAt,
  hirePaidCents = 0,
  bondPaidCents = 0,
}) {
  const hoursNotice = hoursBetween(cancelledAt, startAt);

  // Most generous tier whose notice requirement is satisfied.
  const tier =
    [...(tiers ?? [])]
      .filter((t) => t.isActive !== false && hoursNotice >= t.minHoursBefore)
      .sort((a, b) => b.minHoursBefore - a.minHoursBefore)[0] ?? null;

  const percent = tier?.refundPercent ?? 0;
  const fee = Math.min(tier?.feeCents ?? 0, hirePaidCents);

  const grossHireRefund = Math.round((hirePaidCents * percent) / 100);
  const hireRefundCents = Math.max(0, grossHireRefund - fee);
  const bondRefundCents = bondPaidCents;

  return {
    refundCents: hireRefundCents + bondRefundCents,
    hireRefundCents,
    bondRefundCents,
    withheldCents: hirePaidCents - hireRefundCents,
    feeCents: fee,
    tier,
    hoursNotice: Math.floor(hoursNotice),
    explanation: tier
      ? `${tier.label}: ${percent}% of the hire fee refunded${fee ? `, less a ${fee / 100} administration fee` : ''}.`
      : 'Cancelled too close to the hire date — the hire fee is not refundable.',
  };
}

/** Starting policy for a new organisation. */
export const DEFAULT_CANCELLATION_TIERS = [
  { minHoursBefore: 168, refundPercent: 100, feeCents: 0, label: 'More than 7 days notice' },
  { minHoursBefore: 48, refundPercent: 50, feeCents: 0, label: '2 to 7 days notice' },
  { minHoursBefore: 0, refundPercent: 0, feeCents: 0, label: 'Less than 48 hours notice' },
];
