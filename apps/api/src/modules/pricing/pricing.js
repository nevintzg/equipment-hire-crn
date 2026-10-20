/**
 * Pricing.
 *
 * Every function here is pure: inputs in, numbers out, no database, no clock.
 * That is deliberate. Pricing is the part of the system a customer will argue
 * about, so it has to be exhaustively testable, and a pure module can be tested
 * in milliseconds with no fixtures. The database work (loading rates, writing
 * the quote onto the booking) lives in bookings.service.js.
 *
 * Money is always integer cents and always GST-inclusive, which is how
 * Australian consumer prices are advertised. GST is therefore extracted from
 * the total rather than added to it.
 */

/**
 * @typedef {object} Rate
 * @property {'BASE'|'CUSTOMER_TYPE'} tierKind
 * @property {string|null} customerTypeId
 * @property {'PER_DAY'|'PER_HOUR'|'PER_BOOKING'|'WEEKEND'|'PER_WEEK'} period
 * @property {number} amountCents
 * @property {number} fromUnit
 * @property {number|null} maxChargeCents
 */

/**
 * Pick the rates that apply to this customer.
 *
 * A confirmed customer type gets its own tier if one exists; otherwise the
 * BASE tier. An *unconfirmed* claim must not get the cheaper rate — otherwise
 * anyone could tick "non-profit" at registration and pay nothing.
 *
 * @param {Rate[]} rates
 * @param {{customerTypeId?: string|null, customerTypeConfirmed?: boolean}} customer
 * @returns {Rate[]}
 */
export function resolveRates(rates, customer = {}) {
  const active = rates.filter((r) => r.isActive !== false);
  const eligible =
    customer.customerTypeConfirmed && customer.customerTypeId
      ? active.filter(
          (r) => r.tierKind === 'CUSTOMER_TYPE' && r.customerTypeId === customer.customerTypeId,
        )
      : [];
  return eligible.length ? eligible : active.filter((r) => r.tierKind === 'BASE');
}

/**
 * Charge for one line.
 *
 * Period semantics:
 *   PER_BOOKING  flat, regardless of duration
 *   WEEKEND      flat, when the hire is a Fri–Mon style short block
 *   PER_WEEK     charged per started week (3 days still costs a week)
 *   PER_DAY      per chargeable day, with tiered rates by fromUnit
 *   PER_HOUR     per hour, for HOUR-unit equipment
 *
 * Tiering by `fromUnit` lets an organisation taper long hires — $40 for the
 * first two days, $25 a day after that — by seeding rows with fromUnit 1 and 3.
 * Each unit is charged at the best applicable row, which is what a customer
 * reading the price table expects.
 *
 * @param {Rate[]} rates rates already narrowed by resolveRates
 * @param {number} units chargeable days (or hours)
 * @param {number} quantity how many of the item
 */
export function priceForDays(rates, units, quantity = 1) {
  if (!rates.length) return { lineCents: 0, unitRateCents: 0, period: 'PER_DAY', breakdown: [] };
  if (units < 1 || quantity < 1) {
    return { lineCents: 0, unitRateCents: 0, period: rates[0].period, breakdown: [] };
  }

  const period = rates[0].period;

  if (period === 'PER_BOOKING' || period === 'WEEKEND') {
    const rate = rates[0];
    const lineCents = cap(rate.amountCents * quantity, rate.maxChargeCents, quantity);
    return {
      lineCents,
      unitRateCents: rate.amountCents,
      period,
      breakdown: [
        {
          label: period === 'WEEKEND' ? 'Weekend rate' : 'Flat hire fee',
          units: 1,
          rateCents: rate.amountCents,
          quantity,
        },
      ],
    };
  }

  if (period === 'PER_WEEK') {
    const rate = rates[0];
    const weeks = Math.ceil(units / 7);
    const lineCents = cap(rate.amountCents * weeks * quantity, rate.maxChargeCents, quantity);
    return {
      lineCents,
      unitRateCents: rate.amountCents,
      period,
      breakdown: [
        {
          label: `${weeks} week${weeks === 1 ? '' : 's'}`,
          units: weeks,
          rateCents: rate.amountCents,
          quantity,
        },
      ],
    };
  }

  // Per-day / per-hour, with tiers. Sort descending so the first match for a
  // given unit index is the most specific tier that applies to it.
  const tiers = [...rates].sort((a, b) => b.fromUnit - a.fromUnit);
  const breakdown = [];
  let subtotalPerItem = 0;

  for (let unit = 1; unit <= units; unit += 1) {
    const tier = tiers.find((t) => unit >= t.fromUnit) ?? tiers[tiers.length - 1];
    subtotalPerItem += tier.amountCents;
    const last = breakdown.at(-1);
    if (last && last.rateCents === tier.amountCents) {
      last.units += 1;
    } else {
      breakdown.push({
        label: period === 'PER_HOUR' ? 'Hourly rate' : 'Daily rate',
        units: 1,
        rateCents: tier.amountCents,
        quantity,
      });
    }
  }

  const maxPerItem = rates.reduce(
    (min, r) => (r.maxChargeCents != null ? Math.min(min, r.maxChargeCents) : min),
    Number.POSITIVE_INFINITY,
  );
  const cappedPerItem = Math.min(subtotalPerItem, maxPerItem);

  return {
    lineCents: cappedPerItem * quantity,
    unitRateCents: tiers.at(-1)?.amountCents ?? 0,
    period,
    breakdown,
    capped: cappedPerItem < subtotalPerItem,
  };
}

const cap = (total, maxChargeCents, quantity) =>
  maxChargeCents == null ? total : Math.min(total, maxChargeCents * quantity);

/**
 * GST contained in a GST-inclusive amount.
 *
 * At 10% (1000 basis points) the included GST is total/11, not total*0.1 —
 * getting this backwards overstates GST by 10% on every tax invoice the
 * organisation issues.
 *
 * @param {number} inclusiveCents
 * @param {number} taxRateBp basis points, 1000 = 10%
 */
export function gstComponent(inclusiveCents, taxRateBp = 1000) {
  if (!taxRateBp) return 0;
  return Math.round((inclusiveCents * taxRateBp) / (10_000 + taxRateBp));
}

/**
 * Price a whole basket.
 *
 * @param {object} p
 * @param {Array<{equipmentId: string, name: string, quantity: number, rates: Rate[], bondCents: number}>} p.items
 * @param {number} p.units chargeable days
 * @param {{customerTypeId?: string|null, customerTypeConfirmed?: boolean}} [p.customer]
 * @param {number} [p.taxRateBp]
 * @param {boolean} [p.bondsEnabled]
 * @param {number} [p.discountCents]
 */
export function quoteBooking({
  items,
  units,
  customer = {},
  taxRateBp = 1000,
  bondsEnabled = true,
  discountCents = 0,
}) {
  const lines = items.map((item) => {
    const rates = resolveRates(item.rates ?? [], customer);
    const priced = priceForDays(rates, units, item.quantity);
    const lineBondCents = bondsEnabled ? (item.bondCents ?? 0) * item.quantity : 0;
    return {
      equipmentId: item.equipmentId,
      name: item.name,
      quantity: item.quantity,
      unitRateCents: priced.unitRateCents,
      ratePeriod: priced.period,
      lineHireCents: priced.lineCents,
      lineBondCents,
      breakdown: priced.breakdown,
      capped: Boolean(priced.capped),
      // Which tier the customer actually received, for "why this price?".
      tier: rates[0]?.tierKind ?? 'BASE',
    };
  });

  const hireSubtotalCents = lines.reduce((sum, l) => sum + l.lineHireCents, 0);
  const bondTotalCents = lines.reduce((sum, l) => sum + l.lineBondCents, 0);
  // A discount cannot make the hire fee negative.
  const appliedDiscount = Math.min(Math.max(0, discountCents), hireSubtotalCents);
  const hireAfterDiscount = hireSubtotalCents - appliedDiscount;

  return {
    lines,
    units,
    hireSubtotalCents,
    discountCents: appliedDiscount,
    bondTotalCents,
    // The bond is a refundable deposit, not consideration for a supply, so it
    // carries no GST.
    gstCents: gstComponent(hireAfterDiscount, taxRateBp),
    taxRateBp,
    totalDueCents: hireAfterDiscount + bondTotalCents,
  };
}
