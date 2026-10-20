import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../src/lib/api.js';
import { ApproveDialog, RejectDialog } from '../../src/pages/bookings/BookingActions.jsx';
import { renderAdmin } from './renderAdmin.js';
import { fakeGet, pendingBooking } from './mockData.js';

/**
 * Workflow: staff approve or decline a booking that is waiting for review.
 *
 * Real parts working together: ApproveDialog and RejectDialog, the shared
 * Modal, Field and ErrorBox components, MoneyInput, React Query's mutation
 * (send the request, then handle success or failure) and the toast message.
 *
 * Mocked: only the API client. api.post records what the dialog sends and
 * returns a success or an error that the test chooses. No booking is really
 * changed and no email is sent.
 */
vi.mock('../../src/lib/api.js', () => ({
  api: {
    get: vi.fn(),
    list: vi.fn(),
    post: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    restore: vi.fn(() => Promise.resolve(false)),
  },
}));

const h = React.createElement;

describe('Booking approval', () => {
  it('sends the approval with a discount and shows a success message', async () => {
    // Arrange
    api.get.mockImplementation(fakeGet);
    api.post.mockResolvedValue({ ...pendingBooking, status: 'APPROVED' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderAdmin(h(ApproveDialog, { booking: pendingBooking, onClose, currency: 'AUD' }));
    await screen.findByRole('dialog', { name: 'Approve EH-1001' });

    // Act: give a $20 goodwill discount
    await user.type(screen.getByLabelText('Goodwill discount'), '20');

    // Assert: the amount the customer must pay updates from $150 to $130
    expect(screen.getByText(/asked to pay \$130 to confirm/)).toBeTruthy();

    // Act: approve the booking
    await user.click(screen.getByRole('button', { name: 'Approve booking' }));

    // Assert: the right request was sent, with the discount in cents
    expect(api.post).toHaveBeenCalledWith('/admin/bookings/bk-1/approve', {
      discountCents: 2000,
      paymentWindowHours: undefined,
      staffNotes: undefined,
    });

    // Assert: staff see a confirmation and the dialog asks to close
    expect(
      await screen.findByText('Booking approved — the customer has been emailed'),
    ).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open and shows the error when the API refuses the approval', async () => {
    // Arrange: the fake API answers with an error, e.g. the stock is gone
    api.get.mockImplementation(fakeGet);
    api.post.mockRejectedValue(new Error('Not enough stock is free for these dates'));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderAdmin(h(ApproveDialog, { booking: pendingBooking, onClose, currency: 'AUD' }));
    await screen.findByRole('dialog', { name: 'Approve EH-1001' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Approve booking' }));

    // Assert: the error is shown inside the dialog, and the dialog stays open
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Not enough stock is free for these dates');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Booking decline', () => {
  it('only allows a booking to be declined after a reason is entered', async () => {
    // Arrange
    api.get.mockImplementation(fakeGet);
    api.post.mockResolvedValue({ ...pendingBooking, status: 'REJECTED' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderAdmin(h(RejectDialog, { booking: pendingBooking, onClose }));
    await screen.findByRole('dialog', { name: 'Decline EH-1001' });
    const declineButton = screen.getByRole('button', { name: 'Decline booking' });
    expect(declineButton.disabled).toBe(true);

    // Act: type a reason, then decline
    await user.type(screen.getByLabelText('Reason'), 'The trailer is booked for servicing');
    await user.click(declineButton);

    // Assert: the reason was sent to the API and staff see a confirmation
    expect(api.post).toHaveBeenCalledWith('/admin/bookings/bk-1/reject', {
      reason: 'The trailer is booked for servicing',
    });
    expect(await screen.findByText('Booking declined')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
