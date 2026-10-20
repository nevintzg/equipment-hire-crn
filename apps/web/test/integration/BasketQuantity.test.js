import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../src/lib/api.js';
import { renderApp } from './renderApp.js';
import { fakeGet } from './mockData.js';

/**
 * Workflow: a customer changes or removes equipment on the Basket page.
 *
 * Real parts working together: the Basket page, BasketProvider (basket state
 * and its copy in localStorage), SiteProvider, AuthProvider and React Router.
 *
 * Mocked: only the API client, which returns the fictional site data. The
 * basket itself is not mocked: it is loaded from localStorage exactly as it
 * would be when a customer comes back to the site.
 */
vi.mock('../../src/lib/api.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    restore: vi.fn(() => Promise.resolve(false)),
  },
}));

const BASKET_KEY = 'eqhire.basket.v1';

/** Put one Party Tent in the saved basket, as if added on an earlier visit. */
function saveBasketWithOneTent() {
  const basket = {
    items: [
      {
        equipmentId: 'eq-1',
        slug: 'party-tent',
        name: 'Party Tent',
        categoryId: 'cat-tents',
        image: null,
        quantity: 1,
      },
    ],
    startDate: '',
    endDate: '',
    startTime: '09:00',
    endTime: '17:00',
    pickupLocationId: '',
  };
  localStorage.setItem(BASKET_KEY, JSON.stringify(basket));
}

describe('Basket quantity and removal', () => {
  it('increases the quantity when the + button is clicked', async () => {
    // Arrange
    api.get.mockImplementation(fakeGet);
    saveBasketWithOneTent();
    const user = userEvent.setup();
    renderApp('/basket');
    const quantityBox = await screen.findByLabelText('Quantity of Party Tent');
    expect(quantityBox.value).toBe('1');

    // Act
    await user.click(screen.getByRole('button', { name: 'More' }));

    // Assert: the screen and the saved basket both show 2
    expect(quantityBox.value).toBe('2');
    const saved = JSON.parse(localStorage.getItem(BASKET_KEY));
    expect(saved.items[0].quantity).toBe(2);
  });

  it('shows the empty basket message after the only item is removed', async () => {
    // Arrange
    api.get.mockImplementation(fakeGet);
    saveBasketWithOneTent();
    const user = userEvent.setup();
    renderApp('/basket');
    await screen.findByRole('heading', { name: 'Your basket' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    // Assert: the page switches to the empty state and the saved basket is empty
    expect(screen.getByRole('heading', { name: 'Your basket is empty' })).toBeTruthy();
    expect(screen.queryByText('Party Tent')).toBe(null);
    const saved = JSON.parse(localStorage.getItem(BASKET_KEY));
    expect(saved.items).toEqual([]);
  });
});
