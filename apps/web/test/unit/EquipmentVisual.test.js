import { describe, it, expect } from 'vitest';
import EquipmentVisual from '../../src/components/EquipmentVisual.jsx';
import { render, h } from './render.js';

/**
 * EquipmentVisual (src/components/EquipmentVisual.jsx).
 *
 * Shows an equipment photo, or a placeholder with the item's initials when
 * there is no photo. Used on catalogue cards and the equipment detail page.
 */

describe('EquipmentVisual', () => {
  it('shows a photo when the equipment has a full image URL', () => {
    // Arrange
    const props = {
      storageKey: 'https://images.example.org/party-tent.jpg',
      name: 'Party Tent',
    };

    // Act
    const { html } = render(h(EquipmentVisual, props));

    // Assert
    expect(html).toContain('<img');
    expect(html).toContain('src="https://images.example.org/party-tent.jpg"');
  });

  it('uses the equipment name as alt text unless a custom alt is given', () => {
    // Arrange
    const url = 'https://images.example.org/party-tent.jpg';

    // Act
    const withName = render(h(EquipmentVisual, { storageKey: url, name: 'Party Tent' }));
    const withAlt = render(
      h(EquipmentVisual, { storageKey: url, name: 'Party Tent', alt: 'White tent on grass' }),
    );

    // Assert
    expect(withName.html).toContain('alt="Party Tent"');
    expect(withAlt.html).toContain('alt="White tent on grass"');
  });

  it('shows the initials of the name when there is no image', () => {
    // Arrange
    const props = { storageKey: null, name: 'Party Tent' };

    // Act
    const { html, text } = render(h(EquipmentVisual, props));

    // Assert
    expect(html).not.toContain('<img');
    expect(text).toBe('PT');
  });

  it('gives the placeholder an accessible label for screen readers', () => {
    // Arrange
    const props = { storageKey: null, name: 'Folding Chair' };

    // Act
    const { html } = render(h(EquipmentVisual, props));

    // Assert
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Folding Chair"');
  });
});
