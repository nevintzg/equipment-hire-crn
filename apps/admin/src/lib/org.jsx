import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

/**
 * The public site payload gives the panel the organisation's timezone,
 * currency, categories and locations without a separate admin endpoint.
 */
const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const { data } = useQuery({
    queryKey: ['site'],
    queryFn: () => api.get('/site'),
    staleTime: 60_000,
  });
  const value = data
    ? {
        ...data,
        name: data.settings?.['branding.organisationName'] || data.organisation.name,
        tz: data.organisation.timezone,
        currency: data.organisation.currency,
      }
    : {
        name: 'Equipment hire',
        tz: 'Australia/Adelaide',
        currency: 'AUD',
        categories: [],
        locations: [],
      };
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export const useOrg = () => useContext(OrgContext);
