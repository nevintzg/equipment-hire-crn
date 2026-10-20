import { describe, it, expect } from 'vitest';
import { timeLabel, timesFor, describeSlots } from '../../src/lib/slots.js';

/**
 * Handover windows (src/lib/slots.js).
 *
 * The basket uses these functions to show customers which collection and
 * return times the organisation accepts. They are plain functions: data in,
 * value out, so no React rendering is needed.
 */

// Mock data: same shape as the API's handover slot rows.
// weekday follows JavaScript: Sunday = 0, Friday = 5, Saturday = 6.
const fridayPickup = { weekday: 5, startTime: '16:00', endTime: '17:00', kind: 'PICKUP' };
const saturdayBoth = { weekday: 6, startTime: '09:00', endTime: '12:00', kind: 'BOTH' };
const FRIDAY = '2026-10-23';
const MONDAY = '2026-10-26';

describe('timeLabel', () => {
  it('turns a 24-hour morning time into a short am label', () => {
    // Arrange
    const input = '09:00';

    // Act
    const label = timeLabel(input);

    // Assert
    expect(label).toBe('9am');
  });

  it('shows minutes and pm for an afternoon time', () => {
    // Arrange
    const input = '16:30';

    // Act
    const label = timeLabel(input);

    // Assert
    expect(label).toBe('4:30pm');
  });

  it('shows midday as 12pm and midnight as 12am', () => {
    // Arrange
    const midday = '12:00';
    const midnight = '00:00';

    // Act
    const middayLabel = timeLabel(midday);
    const midnightLabel = timeLabel(midnight);

    // Assert
    expect(middayLabel).toBe('12pm');
    expect(midnightLabel).toBe('12am');
  });
});

describe('timesFor', () => {
  it('lists every half hour inside a matching window, including the end time', () => {
    // Arrange
    const slots = [fridayPickup];

    // Act
    const times = timesFor(slots, FRIDAY, 'PICKUP');

    // Assert
    expect(times).toEqual(['16:00', '16:30', '17:00']);
  });

  it('returns an empty list when the chosen date has no window', () => {
    // Arrange
    const slots = [fridayPickup];

    // Act
    const times = timesFor(slots, MONDAY, 'PICKUP');

    // Assert
    expect(times).toEqual([]);
  });

  it('does not offer a pickup-only window as a return time', () => {
    // Arrange
    const slots = [fridayPickup];

    // Act
    const times = timesFor(slots, FRIDAY, 'RETURN');

    // Assert
    expect(times).toEqual([]);
  });

  it('returns null when the organisation has set no windows at all', () => {
    // Arrange
    const slots = [];

    // Act
    const times = timesFor(slots, FRIDAY, 'PICKUP');

    // Assert
    // null means "no restriction: any time is fine" (see the comment in slots.js)
    expect(times).toBe(null);
  });
});

describe('describeSlots', () => {
  it('describes the windows in weekday order as readable text', () => {
    // Arrange: Saturday is listed first on purpose, to check the sorting
    const slots = [saturdayBoth, fridayPickup];

    // Act
    const text = describeSlots(slots, 'PICKUP');

    // Assert
    expect(text).toBe('Fri 4pm–5pm, Sat 9am–12pm');
  });

  it('only includes windows that allow the requested kind of handover', () => {
    // Arrange
    const slots = [saturdayBoth, fridayPickup];

    // Act
    const text = describeSlots(slots, 'RETURN');

    // Assert
    expect(text).toBe('Sat 9am–12pm');
  });
});
