import { describe, it, expect } from 'vitest';
import { StatusBadge } from '@equipment-hire/client/ui';
import { render, h } from './render.js';

/**
 * StatusBadge (packages/client/src/ui.jsx, shared by both apps).
 *
 * The coloured label staff see next to every booking on the admin Dashboard,
 * Bookings list, Booking detail and Customer detail pages. The colour comes
 * from a CSS class: badge-warning, badge-success, badge-danger, and so on.
 */

describe('StatusBadge', () => {
  it('shows a booking waiting for review as a warning badge', () => {
    // Arrange
    const props = { status: 'PENDING_REVIEW' };

    // Act
    const { html } = render(h(StatusBadge, props));

    // Assert
    expect(html).toBe('<span class="badge badge-warning">Awaiting review</span>');
  });

  it('shows a confirmed booking as a success badge', () => {
    // Arrange
    const props = { status: 'CONFIRMED' };

    // Act
    const { html, text } = render(h(StatusBadge, props));

    // Assert
    expect(text).toBe('Confirmed');
    expect(html).toContain('badge-success');
  });

  it('shows an overdue booking as a danger badge', () => {
    // Arrange
    const props = { status: 'OVERDUE' };

    // Act
    const { html, text } = render(h(StatusBadge, props));

    // Assert
    expect(text).toBe('Overdue');
    expect(html).toContain('badge-danger');
  });

  it('shows the raw code in a neutral badge for an unknown status', () => {
    // Arrange
    const props = { status: 'SOMETHING_NEW' };

    // Act
    const { html, text } = render(h(StatusBadge, props));

    // Assert
    expect(text).toBe('SOMETHING_NEW');
    expect(html).toContain('badge-neutral');
  });
});
