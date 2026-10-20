import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@equipment-hire/client/ui';
import '@equipment-hire/client/base.css';
import './styles.css';
import { SiteProvider } from './lib/site.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { BasketProvider } from './lib/basket.jsx';
import App from './App.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx will not fix itself on retry; a cold-starting free-tier API might.
      retry: (count, err) => count < 2 && !(err?.status >= 400 && err?.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <SiteProvider>
            <AuthProvider>
              <BasketProvider>
                <App />
              </BasketProvider>
            </AuthProvider>
          </SiteProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
