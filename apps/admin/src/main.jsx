import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@equipment-hire/client/ui';
import '@equipment-hire/client/base.css';
import './styles.css';
import { AuthProvider } from './lib/auth.jsx';
import App from './App.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => count < 2 && !(err?.status >= 400 && err?.status < 500),
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
