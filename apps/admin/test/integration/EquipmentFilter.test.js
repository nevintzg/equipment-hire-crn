import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../src/lib/api.js';
import EquipmentList from '../../src/pages/equipment/EquipmentList.jsx';
import { renderAdmin } from './renderAdmin.js';
import { fakeEquipmentList, fakeGet } from './mockData.js';

/**
 * Workflow: staff filter and search the equipment list.
 *
 * Real parts working together: the EquipmentList page, its filter form, the
 * URL search parameters (React Router), React Query, OrgProvider (category
 * names, currency), AuthProvider, PageHeader and the status badges.
 *
 * Mocked: only the API client (src/lib/api.js). It returns the fictional
 * equipment in mockData.js instead of calling the backend.
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

describe('Equipment list filters', () => {
  it('asks the API for draft equipment and shows only drafts when Draft is selected', async () => {
    // Arrange: open the list; both items are shown at first
    api.get.mockImplementation(fakeGet);
    api.list.mockImplementation(fakeEquipmentList);
    const user = userEvent.setup();
    renderAdmin(React.createElement(EquipmentList), '/equipment');
    await screen.findByText('Party Tent');
    expect(screen.getByText('Box Trailer')).toBeTruthy();

    // Act: choose "Draft" in the status filter
    await user.selectOptions(screen.getByLabelText('Status'), 'DRAFT');

    // Assert: the page asked the API for draft equipment only
    expect(api.list).toHaveBeenLastCalledWith('/admin/equipment', {
      search: '',
      status: 'DRAFT',
      page: 1,
      pageSize: 25,
    });

    // Assert: the table updates to show only the draft item
    await waitFor(() => expect(screen.queryByText('Party Tent')).toBe(null));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Box Trailer')).toBeTruthy();
    expect(within(table).getByText('Draft')).toBeTruthy();
    expect(within(table).getByText('Trailers')).toBeTruthy();
  });

  it('searches equipment by name when the search form is submitted', async () => {
    // Arrange
    api.get.mockImplementation(fakeGet);
    api.list.mockImplementation(fakeEquipmentList);
    const user = userEvent.setup();
    renderAdmin(React.createElement(EquipmentList), '/equipment');
    await screen.findByText('Party Tent');

    // Act: type a search and press Enter
    await user.type(screen.getByLabelText('Search equipment'), 'tent{Enter}');

    // Assert: the search text was sent to the API
    expect(api.list).toHaveBeenLastCalledWith('/admin/equipment', {
      search: 'tent',
      status: '',
      page: 1,
      pageSize: 25,
    });

    // Assert: only the matching item is listed, with its stock and bond
    await waitFor(() => expect(screen.queryByText('Box Trailer')).toBe(null));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Party Tent')).toBeTruthy();
    expect(within(table).getByText('5 (pool)')).toBeTruthy();
    expect(within(table).getByText('$100')).toBeTruthy();
  });
});
