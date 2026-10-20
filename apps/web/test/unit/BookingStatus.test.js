import { describe, it, expect } from 'vitest';
import { BOOKING_STATUS, statusLabel, statusTone } from '@equipment-hire/client';

/**
 * Booking status display.
 *
 * The customer's "My bookings" pages show each booking's status using these
 * helpers from the shared @equipment-hire/client package
 * (packages/client/src/status.js). The API stores a status code such as
 * PENDING_REVIEW; these helpers turn it into words a customer understands.
 */

describe('Booking status labels', () => {
  it('turns status codes into readable labels', () => {
    // Arrange
    const pending = 'PENDING_REVIEW';
    const confirmed = 'CONFIRMED';
    const pickedUp = 'PICKED_UP';

    // Act
    const pendingLabel = statusLabel(pending);
    const confirmedLabel = statusLabel(confirmed);
    const pickedUpLabel = statusLabel(pickedUp);

    // Assert
    expect(pendingLabel).toBe('Awaiting review');
    expect(confirmedLabel).toBe('Confirmed');
    expect(pickedUpLabel).toBe('On hire');
  });

  it('shows a rejected booking as "Declined"', () => {
    // Arrange
    const status = 'REJECTED';

    // Act
    const label = statusLabel(status);

    // Assert
    expect(label).toBe('Declined');
  });

  it('gives each status a colour tone that matches its meaning', () => {
    // Arrange
    const statuses = ['PENDING_REVIEW', 'CONFIRMED', 'OVERDUE', 'CANCELLED'];

    // Act
    const tones = statuses.map(statusTone);

    // Assert
    expect(tones).toEqual(['warning', 'success', 'danger', 'neutral']);
  });

  it('falls back safely for a status code it does not know', () => {
    // Arrange
    const unknown = 'SOMETHING_NEW';

    // Act
    const label = statusLabel(unknown);
    const tone = statusTone(unknown);

    // Assert: shows the raw code with a neutral colour, instead of crashing
    expect(label).toBe('SOMETHING_NEW');
    expect(tone).toBe('neutral');
  });

  it('has a customer-friendly message for every status', () => {
    // Arrange
    const statuses = Object.keys(BOOKING_STATUS);

    // Act
    const missing = statuses.filter((s) => !BOOKING_STATUS[s].customer);

    // Assert
    expect(missing).toEqual([]);
    expect(BOOKING_STATUS.APPROVED.customer).toBe('Approved — payment needed to confirm');
  });
});
