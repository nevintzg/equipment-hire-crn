import { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Spinner, ErrorBox } from '@equipment-hire/client/ui';

/**
 * The boot payload: organisation, public settings, navigation, categories,
 * announcements and locations. Everything branded reads from here.
 */
const SiteContext = createContext(null);

export function SiteProvider({ children }) {
  const query = useQuery({
    queryKey: ['site'],
    queryFn: () => api.get('/site'),
    staleTime: 60_000,
  });

  const settings = query.data?.settings;
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement.style;
    if (settings['branding.primaryColour'])
      root.setProperty('--brand', settings['branding.primaryColour']);
    if (settings['branding.accentColour'])
      root.setProperty('--accent', settings['branding.accentColour']);
  }, [settings]);

  if (query.isPending) return <Spinner label="Loading site" />;
  if (query.isError)
    return (
      <div style={{ maxWidth: 520, margin: '4rem auto', padding: 16 }}>
        <ErrorBox error={query.error} onRetry={() => query.refetch()} />
      </div>
    );

  return <SiteContext.Provider value={query.data}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const site = useContext(SiteContext);
  const s = site.settings ?? {};
  return {
    ...site,
    name: s['branding.organisationName'] || site.organisation.name,
    tz: site.organisation.timezone,
    currency: site.organisation.currency,
    setting: (key, fallback) => s[key] ?? fallback,
  };
}
