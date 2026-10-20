import { describe, it, expect } from 'vitest';
import { money, toCents, toDollars } from '@equipment-hire/client';

/**
 * Money helpers (packages/client/src/format.js, shared by both apps).
 *
 * The system stores money as whole cents (1250 = $12.50) so it never does
 * maths with decimals. The admin panel uses these three functions whenever
 * money moves between the screen and the system:
 *   toCents   — what staff typed  → cents   (used by MoneyInput)
 *   toDollars — cents → text for a form box (used by MoneyInput)
 *   money     — cents → "$12.50" for display (used on admin pages)
 */

describe('toCents', () => {
  it('converts typed dollars into whole cents', () => {
    // Arrange
    const typed = '12.50';

    // Act
    const cents = toCents(typed);

    // Assert
    expect(cents).toBe(1250);
  });

  it('ignores a dollar sign, commas and spaces', () => {
    // Arrange
    const typed = '$1,250.00 ';

    // Act
    const cents = toCents(typed);

    // Assert
    expect(cents).toBe(125000);
  });

  it('rounds to the nearest cent instead of giving a decimal error', () => {
    // Arrange: 19.99 * 100 is 1998.9999999999998 in JavaScript
    const typed = '19.99';

    // Act
    const cents = toCents(typed);

    // Assert
    expect(cents).toBe(1999);
  });

  it('returns null for blank or non-numeric input', () => {
    // Arrange
    const blank = '';
    const notANumber = 'abc';

    // Act
    const blankResult = toCents(blank);
    const textResult = toCents(notANumber);

    // Assert
    expect(blankResult).toBe(null);
    expect(textResult).toBe(null);
  });
});

describe('toDollars', () => {
  it('turns cents into a two-decimal dollars string, or blank for no value', () => {
    // Arrange
    const cents = 1250;

    // Act
    const text = toDollars(cents);
    const empty = toDollars(null);

    // Assert
    expect(text).toBe('12.50');
    expect(empty).toBe('');
  });
});

describe('money', () => {
  it('formats cents as Australian dollars, hiding .00 on whole amounts', () => {
    // Arrange
    const whole = 4500;
    const withCents = 4550;

    // Act
    const wholeText = money(whole);
    const centsText = money(withCents);

    // Assert
    expect(wholeText).toBe('$45');
    expect(centsText).toBe('$45.50');
  });

  it('shows a dash when there is no amount', () => {
    // Arrange
    const missing = null;

    // Act
    const text = money(missing);

    // Assert
    expect(text).toBe('—');
  });
});
