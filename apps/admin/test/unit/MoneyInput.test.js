import { describe, it, expect } from 'vitest';
import MoneyInput from '../../src/components/MoneyInput.jsx';
import { render, h } from './render.js';

/**
 * MoneyInput (src/components/MoneyInput.jsx).
 *
 * The money box used across the admin panel (discounts, refunds, bonds, fees).
 * Staff type dollars, but the value it receives and sends is integer cents,
 * e.g. 1250 cents is shown as "12.50".
 *
 * These tests check what the box SHOWS for a given value. They do not type
 * into it: that needs a browser-like test environment (see the report's
 * Limitations section).
 */

// The component requires an onChange function. It is never called in these
// display-only tests, so an empty function is enough.
const noop = () => {};

describe('MoneyInput', () => {
  it('shows an amount in cents as dollars with two decimal places', () => {
    // Arrange
    const props = { value: 1250, onChange: noop };

    // Act
    const { html } = render(h(MoneyInput, props));

    // Assert
    expect(html).toContain('value="12.50"');
  });

  it('shows zero as an empty box with a 0.00 placeholder', () => {
    // Arrange
    const props = { value: 0, onChange: noop };

    // Act
    const { html } = render(h(MoneyInput, props));

    // Assert
    expect(html).toContain('value=""');
    expect(html).toContain('placeholder="0.00"');
  });

  it('has no placeholder when an empty value is allowed', () => {
    // Arrange
    const props = { value: null, onChange: noop, allowNull: true };

    // Act
    const { html } = render(h(MoneyInput, props));

    // Assert
    expect(html).toContain('value=""');
    expect(html).toContain('placeholder=""');
  });

  it('shows a dollar sign and passes extra settings through to the input', () => {
    // Arrange
    const props = { value: 500, onChange: noop, disabled: true, 'aria-label': 'Refund amount' };

    // Act
    const { html, text } = render(h(MoneyInput, props));

    // Assert
    expect(text).toBe('$');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Refund amount"');
  });
});
