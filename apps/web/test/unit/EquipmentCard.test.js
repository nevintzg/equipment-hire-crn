import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import EquipmentCard from '../../src/components/EquipmentCard.jsx';
import { render, h } from './render.js';

/**
 * EquipmentCard (src/components/EquipmentCard.jsx).
 *
 * One card in the public catalogue: image, category, name, summary and the
 * "From $x per day" price.
 *
 * The card reads the currency and category list from useSite(), which
 * normally downloads them from the API when the site loads. A unit test must
 * not need the API, so vi.mock swaps that file for a fake useSite() that
 * returns fixed mock data. The card component itself is the real one.
 */
vi.mock('../../src/lib/site.jsx', () => ({
  useSite: () => ({
    currency: 'AUD',
    categories: [
      { id: 'cat-tents', slug: 'tents', name: 'Tents & Marquees' },
      { id: 'cat-chairs', slug: 'chairs', name: 'Chairs' },
    ],
  }),
}));

// Mock data: same shape as one item from GET /api/v1/equipment.
const partyTent = {
  id: 'eq-1',
  slug: 'party-tent',
  name: 'Party Tent',
  categoryId: 'cat-tents',
  summary: 'Fits 30 guests',
  primaryImage: null,
  pricing: { fromCents: 4500, period: 'PER_DAY', bondCents: 10000 },
};

// The card contains a <Link>, which only works inside a router.
const renderCard = (item) => render(h(MemoryRouter, null, h(EquipmentCard, { item })));

describe('EquipmentCard', () => {
  it('shows the equipment name and links to its detail page', () => {
    // Arrange
    const item = partyTent;

    // Act
    const { html, text } = renderCard(item);

    // Assert
    expect(text).toContain('Party Tent');
    expect(html).toContain('href="/equipment/party-tent"');
  });

  it('shows the name of the category the equipment belongs to', () => {
    // Arrange
    const item = partyTent;

    // Act
    const { text } = renderCard(item);

    // Assert
    expect(text).toContain('Tents & Marquees');
    expect(text).not.toContain('Chairs');
  });

  it('shows the starting price formatted as money with its period', () => {
    // Arrange
    const item = partyTent;

    // Act
    const { text } = renderCard(item);

    // Assert
    expect(text).toContain('From $45 per day');
  });

  it('shows "Free to borrow" when the starting price is zero', () => {
    // Arrange
    const item = { ...partyTent, pricing: { fromCents: 0, period: 'PER_DAY', bondCents: 0 } };

    // Act
    const { text } = renderCard(item);

    // Assert
    expect(text).toContain('Free to borrow');
    expect(text).not.toContain('From');
  });

  it('leaves out the price, summary and category when they are not provided', () => {
    // Arrange: pricing is null when the organisation hides prices
    const item = { ...partyTent, pricing: null, summary: null, categoryId: 'unknown' };

    // Act
    const { text } = renderCard(item);

    // Assert
    expect(text).toContain('Party Tent');
    expect(text).not.toContain('$');
    expect(text).not.toContain('Free to borrow');
    expect(text).not.toContain('Fits 30 guests');
    expect(text).not.toContain('Tents & Marquees');
  });
});
