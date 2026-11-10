import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './i18n';
import './index.css';
import { initTheme } from './prefs';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    // Another device may have changed the day: refresh when the tab gets focus again.
    queries: { refetchOnWindowFocus: true, retry: 1 },
  },
});

// The service worker makes the app installable (and shows push notifications later on).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
