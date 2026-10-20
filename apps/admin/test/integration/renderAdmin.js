import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@equipment-hire/client/ui';
import { AuthProvider } from '../../src/lib/auth.jsx';
import { OrgProvider } from '../../src/lib/org.jsx';

const h = React.createElement;

/**
 * Render one admin page or dialog inside the real providers, in the same
 * order as src/main.jsx and src/App.jsx. MemoryRouter replaces BrowserRouter
 * so the test controls the starting URL.
 */
export function renderAdmin(element, path = '/') {
  // A new React Query cache for every test; failed requests are not retried.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    h(
      QueryClientProvider,
      { client: queryClient },
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(ToastProvider, null, h(AuthProvider, null, h(OrgProvider, null, element))),
      ),
    ),
  );
}
