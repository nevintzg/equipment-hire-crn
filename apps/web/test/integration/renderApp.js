import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@equipment-hire/client/ui';
import { SiteProvider } from '../../src/lib/site.jsx';
import { AuthProvider } from '../../src/lib/auth.jsx';
import { BasketProvider } from '../../src/lib/basket.jsx';
import EquipmentDetail from '../../src/pages/EquipmentDetail.jsx';
import Basket from '../../src/pages/Basket.jsx';

const h = React.createElement;

/**
 * Render the customer site starting at `path`.
 *
 * The providers are the real ones, in the same order as src/main.jsx. The
 * only difference is MemoryRouter instead of BrowserRouter, so the test
 * controls the starting URL. Two real pages are registered: the equipment
 * detail page and the basket page.
 */
export function renderApp(path) {
  // A new React Query cache for every test; failed requests are not retried.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    h(
      QueryClientProvider,
      { client: queryClient },
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(
          ToastProvider,
          null,
          h(
            SiteProvider,
            null,
            h(
              AuthProvider,
              null,
              h(
                BasketProvider,
                null,
                h(
                  Routes,
                  null,
                  h(Route, { path: '/equipment/:slug', element: h(EquipmentDetail) }),
                  h(Route, { path: '/basket', element: h(Basket) }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
