import { describe, it, expect } from 'vitest';
import {
  gstComponent,
  priceForDays,
  quoteBooking,
  resolveRates,
} from '#src/modules/pricing/pricing.js';

const base = (amountCents, fromUnit = 1, extra = {}) => ({
  tierKind: 'BASE',
  customerTypeId: null,
  period: 'PER_DAY',
  amountCents,
  fromUnit,
  maxChargeCents: null,
  ...extra,
});

describe('resolveRates', () => {
  const rates = [
    base(6000),
    { ...base(2500), tierKind: 'CUSTOMER_TYPE', customerTypeId: 'np' },
    { ...base(4000), tierKind: 'CUSTOMER_TYPE', customerTypeId: 'resident' },
  ];

  it('gives an anonymous visitor the base rate', () => {
    expect(resolveRates(rates, {}).map((r) => r.amountCents)).toEqual([6000]);
  });

  it('gives a confirmed customer type its own rate', () => {
    const resolved = resolveRates(rates, { customerTypeId: 'np', customerTypeConfirmed: true });
    expect(resolved.map((r) => r.amountCents)).toEqual([2500]);
  });

  // The important one: anyone can tick "non-profit" at registration, so an
  // unconfirmed claim must not unlock the cheaper rate.
  it('ignores an UNCONFIRMED customer type claim', () => {
    const resolved = resolveRates(rates, { customerTypeId: 'np', customerTypeConfirmed: false });
    expect(resolved.map((r) => r.amountCents)).toEqual([6000]);
  });

  it('falls back to base when the type has no rate of its own', () => {
    const resolved = resolveRates(rates, { customerTypeId: 'school', customerTypeConfirmed: true });
    expect(resolved.map((r) => r.amountCents)).toEqual([6000]);
  });

  it('excludes inactive rates', () => {
    const resolved = resolveRates([base(6000, 1, { isActive: false }), base(1000)], {});
    expect(resolved.map((r) => r.amountCents)).toEqual([1000]);
  });
});

describe('priceForDays', () => {
  it('charges a flat daily rate', () => {
    expect(priceForDays([base(5000)], 3, 1).lineCents).toBe(15_000);
  });

  it('multiplies by quantity', () => {
    expect(priceForDays([base(800)], 2, 6).lineCents).toBe(9600);
  });

  it('applies a tapered rate from the tier threshold onward', () => {
    // $60 for days 1-2, $35 from day 3: 60 + 60 + 35 + 35 = $190
    const rates = [base(6000, 1), base(3500, 3)];
    const result = priceForDays(rates, 4, 1);
    expect(result.lineCents).toBe(19_000);
    expect(result.breakdown).toEqual([
      { label: 'Daily rate', units: 2, rateCents: 6000, quantity: 1 },
      { label: 'Daily rate', units: 2, rateCents: 3500, quantity: 1 },
    ]);
  });

  it('honours a maximum charge cap', () => {
    const rates = [base(6000, 1, { maxChargeCents: 15_000 })];
    const result = priceForDays(rates, 10, 1);
    expect(result.lineCents).toBe(15_000);
    expect(result.capped).toBe(true);
  });

  it('caps per item, not per line', () => {
    const rates = [base(6000, 1, { maxChargeCents: 15_000 })];
    expect(priceForDays(rates, 10, 3).lineCents).toBe(45_000);
  });

  it('charges a PER_BOOKING rate once regardless of length', () => {
    const rates = [{ ...base(4500), period: 'PER_BOOKING' }];
    expect(priceForDays(rates, 1, 1).lineCents).toBe(4500);
    expect(priceForDays(rates, 9, 1).lineCents).toBe(4500);
  });

  it('charges a WEEKEND rate once', () => {
    const rates = [{ ...base(4500), period: 'WEEKEND' }];
    expect(priceForDays(rates, 3, 1).lineCents).toBe(4500);
  });

  it('charges PER_WEEK by started week', () => {
    const rates = [{ ...base(10_000), period: 'PER_WEEK' }];
    expect(priceForDays(rates, 1, 1).lineCents).toBe(10_000);
    expect(priceForDays(rates, 7, 1).lineCents).toBe(10_000);
    expect(priceForDays(rates, 8, 1).lineCents).toBe(20_000);
  });

  it('returns zero for free equipment rather than throwing', () => {
    expect(priceForDays([base(0)], 5, 10).lineCents).toBe(0);
  });

  it('returns zero when no rate is configured', () => {
    expect(priceForDays([], 3, 1).lineCents).toBe(0);
  });
});

describe('gstComponent', () => {
  // The classic error is total * 0.1, which overstates GST by 10%.
  it('extracts GST from a GST-inclusive amount', () => {
    expect(gstComponent(11_000, 1000)).toBe(1000);
    expect(gstComponent(7500, 1000)).toBe(682); // 7500 / 11
  });

  it('is zero when the organisation is not registered for GST', () => {
    expect(gstComponent(11_000, 0)).toBe(0);
  });

  it('rounds to the nearest cent', () => {
    expect(gstComponent(1, 1000)).toBe(0);
    expect(gstComponent(6, 1000)).toBe(1);
  });
});

describe('quoteBooking', () => {
  const items = [
    { equipmentId: 'a', name: 'Marquee', quantity: 1, rates: [base(6000)], bondCents: 10_000 },
    { equipmentId: 'b', name: 'Table', quantity: 6, rates: [base(800)], bondCents: 0 },
  ];

  it('totals hire, bond and GST for a basket', () => {
    const quote = quoteBooking({ items, units: 3 });
    expect(quote.hireSubtotalCents).toBe(18_000 + 14_400);
    expect(quote.bondTotalCents).toBe(10_000);
    expect(quote.totalDueCents).toBe(32_400 + 10_000);
    // The bond is a deposit, not a supply, so it carries no GST.
    expect(quote.gstCents).toBe(gstComponent(32_400, 1000));
  });

  it('omits bonds when the organisation has them switched off', () => {
    const quote = quoteBooking({ items, units: 3, bondsEnabled: false });
    expect(quote.bondTotalCents).toBe(0);
    expect(quote.totalDueCents).toBe(32_400);
  });

  it('applies a discount to the hire fee and recomputes GST', () => {
    const quote = quoteBooking({ items, units: 3, discountCents: 2400 });
    expect(quote.discountCents).toBe(2400);
    expect(quote.totalDueCents).toBe(30_000 + 10_000);
    expect(quote.gstCents).toBe(gstComponent(30_000, 1000));
  });

  it('never lets a discount drive the hire fee negative', () => {
    const quote = quoteBooking({ items, units: 1, discountCents: 999_999 });
    expect(quote.discountCents).toBe(quote.hireSubtotalCents);
    expect(quote.totalDueCents).toBe(quote.bondTotalCents);
  });

  it('records which tier priced each line, for staff answering queries', () => {
    const rates = [base(6000), { ...base(2500), tierKind: 'CUSTOMER_TYPE', customerTypeId: 'np' }];
    const quote = quoteBooking({
      items: [{ equipmentId: 'a', name: 'Marquee', quantity: 1, rates, bondCents: 0 }],
      units: 2,
      customer: { customerTypeId: 'np', customerTypeConfirmed: true },
    });
    expect(quote.lines[0].tier).toBe('CUSTOMER_TYPE');
    expect(quote.lines[0].lineHireCents).toBe(5000);
  });
});
