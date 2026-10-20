import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../src/lib/api.js';
import { renderApp } from './renderApp.js';
import { fakeGet } from './mockData.js';

/**
 * Workflow: a customer adds equipment to the basket from the equipment page.
 *
 * Real parts working together: the EquipmentDetail page, the Basket page,
 * BasketProvider (basket state saved in localStorage), ToastProvider,
 * SiteProvider, AuthProvider, React Query and React Router.
 *
 * Mocked: only the API client (src/lib/api.js). Instead of sending HTTP
 * requests to the backend, it returns the fictional data in mockData.js.
 * The customer is signed out (restore() resolves false).
 */
vi.mock('../../src/lib/api.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    restore: vi.fn(() => Promise.resolve(false)),
  },
}));

describe('Add equipment to basket', () => {
  it('adds the chosen quantity to the basket and confirms it', async () => {
    // Arrange: open the Party Tent page and wait for the fake API data to load
    api.get.mockImplementation(fakeGet);
    const user = userEvent.setup();
    renderApp('/equipment/party-tent');
    await screen.findByRole('heading', { name: 'Party Tent' });

    // Act: choose a quantity of 2, then add to the basket
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: 'Add to basket' }));

    // Assert: the page and the toast message both confirm the new basket
    expect(screen.getByText('2 in your basket')).toBeTruthy();
    expect(screen.getByText('Party Tent added to your basket')).toBeTruthy();

    // Assert: the basket state was saved with the right item and quantity
    const saved = JSON.parse(localStorage.getItem('eqhire.basket.v1'));
    expect(saved.items).toEqual([
      {
        equipmentId: 'eq-1',
        slug: 'party-tent',
        name: 'Party Tent',
        categoryId: 'cat-tents',
        image: null,
        quantity: 2,
      },
    ]);
  });

  it('opens the basket page with the added equipment when View basket is clicked', async () => {
    // Arrange: open the Party Tent page and add one tent to the basket
    api.get.mockImplementation(fakeGet);
    const user = userEvent.setup();
    renderApp('/equipment/party-tent');
    await screen.findByRole('heading', { name: 'Party Tent' });
    await user.click(screen.getByRole('button', { name: 'Add to basket' }));

    // Act: go to the basket
    await user.click(screen.getByRole('button', { name: 'View basket' }));

    // Assert: the router showed the Basket page, which reads the same basket state
    expect(screen.getByRole('heading', { name: 'Your basket' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Party Tent' })).toBeTruthy();
    expect(screen.getByLabelText('Quantity of Party Tent').value).toBe('1');

    // Assert: a signed-out customer is asked to sign in before seeing a price
    expect(screen.getByText(/Sign in to see your price/)).toBeTruthy();
  });
});
