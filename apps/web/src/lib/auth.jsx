import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { Spinner } from '@equipment-hire/client/ui';

const AuthContext = createContext(null);

/** Restores the session from the refresh cookie before rendering routes. */
export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const qc = useQueryClient();

  useEffect(() => {
    const off = api.subscribe((s) => {
      setSession(s);
      // Prices depend on who is asking, so cached catalogue data is stale
      // the moment the user changes.
      qc.invalidateQueries({ queryKey: ['equipment'] });
    });
    api.restore().finally(() => setReady(true));
    return off;
  }, [qc]);

  if (!ready) return <Spinner label="Signing in" />;
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const session = useContext(AuthContext);
  return { user: session?.user ?? null, signedIn: Boolean(session) };
}

export function RequireAuth({ children }) {
  const { signedIn } = useAuth();
  const location = useLocation();
  if (!signedIn) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return children;
}
