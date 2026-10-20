import { describe, it, expect } from 'vitest';
import PageHeader from '../../src/components/PageHeader.jsx';
import { render, h } from './render.js';

/**
 * PageHeader (src/components/PageHeader.jsx).
 *
 * The heading at the top of almost every admin page, e.g. "Bookings" or
 * "Calendar". It takes a title, an optional subtitle, and optional children
 * (usually action buttons) shown on the right.
 */

describe('PageHeader', () => {
  it('shows the title as the main page heading', () => {
    // Arrange
    const props = { title: 'Bookings' };

    // Act
    const { html } = render(h(PageHeader, props));

    // Assert
    expect(html).toContain('<h1>Bookings</h1>');
  });

  it('shows the subtitle when one is given', () => {
    // Arrange
    const props = { title: 'Enquiries', subtitle: 'Messages from the website contact form' };

    // Act
    const { html, text } = render(h(PageHeader, props));

    // Assert
    expect(text).toContain('Messages from the website contact form');
    expect(html).toContain('<p class="muted">');
  });

  it('does not add an empty subtitle paragraph when there is no subtitle', () => {
    // Arrange
    const props = { title: 'Customers' };

    // Act
    const { html } = render(h(PageHeader, props));

    // Assert
    expect(html).not.toContain('<p');
  });

  it('shows action buttons passed in as children', () => {
    // Arrange
    const button = h('button', { className: 'btn' }, 'New category');

    // Act
    const { html, text } = render(h(PageHeader, { title: 'Categories' }, button));

    // Assert
    expect(text).toContain('New category');
    expect(html).toContain('<div class="row"><button class="btn">New category</button></div>');
  });

  it('does not add the actions area when there are no children', () => {
    // Arrange
    const props = { title: 'Customers' };

    // Act
    const { html } = render(h(PageHeader, props));

    // Assert
    expect(html).not.toContain('class="row"');
  });
});
