import { describe, it, expect } from 'vitest';
import {
  CUSTOMER_CANCELLABLE,
  TRANSITIONS,
  canTransition,
  effectiveStatus,
  isTerminal,
} from '#src/modules/bookings/booking-state.js';

describe('transition table', () => {
  it('allows the happy path end to end', () => {
    const path = ['PENDING_REVIEW', 'APPROVED', 'CONFIRMED', 'PICKED_UP', 'RETURNED', 'COMPLETED'];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it('refuses to skip payment', () => {
    expect(canTransition('APPROVED', 'PICKED_UP')).toBe(false);
    expect(canTransition('PENDING_REVIEW', 'CONFIRMED')).toBe(false);
  });

  it('refuses to go backwards', () => {
    expect(canTransition('CONFIRMED', 'APPROVED')).toBe(false);
    expect(canTransition('COMPLETED', 'RETURNED')).toBe(false);
  });

  it('will not cancel equipment that is already out', () => {
    // Once the gear has left the shed, the booking has to be returned, not
    // cancelled — otherwise the stock is released while it is still out.
    expect(canTransition('PICKED_UP', 'CANCELLED')).toBe(false);
  });

  it('treats every exit state as terminal', () => {
    for (const status of ['COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
      expect(isTerminal(status), status).toBe(true);
    }
  });

  it('lets a customer cancel only before collection', () => {
    expect([...CUSTOMER_CANCELLABLE].sort()).toEqual(['APPROVED', 'CONFIRMED', 'PENDING_REVIEW']);
  });

  it('covers every status in the table', () => {
    const statuses = [
      'PENDING_REVIEW',
      'APPROVED',
      'CONFIRMED',
      'PICKED_UP',
      'RETURNED',
      'COMPLETED',
      'REJECTED',
      'EXPIRED',
      'CANCELLED',
    ];
    expect(Object.keys(TRANSITIONS).sort()).toEqual(statuses.sort());
  });
});

describe('effectiveStatus', () => {
  const at = new Date('2026-06-15T02:00:00Z');

  it('reports an unpaid approval past its deadline as expired', () => {
    const status = effectiveStatus(
      {
        status: 'APPROVED',
        paymentDueAt: new Date('2026-06-14T00:00:00Z'),
        endAt: new Date('2026-07-01T00:00:00Z'),
      },
      at,
    );
    expect(status).toBe('EXPIRED');
  });

  it('leaves an approval inside its window alone', () => {
    const status = effectiveStatus(
      {
        status: 'APPROVED',
        paymentDueAt: new Date('2026-06-16T00:00:00Z'),
        endAt: new Date('2026-07-01T00:00:00Z'),
      },
      at,
    );
    expect(status).toBe('APPROVED');
  });

  it('reports a late hire as overdue without losing that it was collected', () => {
    const status = effectiveStatus(
      { status: 'PICKED_UP', paymentDueAt: null, endAt: new Date('2026-06-10T00:00:00Z') },
      at,
    );
    expect(status).toBe('OVERDUE');
    // OVERDUE is not in the transition table, because it is a view of
    // PICKED_UP rather than a state of its own.
    expect(TRANSITIONS.OVERDUE).toBeUndefined();
  });

  it('does not touch a completed booking', () => {
    const status = effectiveStatus(
      { status: 'COMPLETED', paymentDueAt: null, endAt: new Date('2026-01-01T00:00:00Z') },
      at,
    );
    expect(status).toBe('COMPLETED');
  });
});
