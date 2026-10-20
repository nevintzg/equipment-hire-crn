import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { Spinner } from '@equipment-hire/client/ui';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    const off = api.subscribe(setSession);
    api.restore().finally(() => setReady(true));
    return off;
  }, []);

  if (!ready) return <Spinner label="Signing in" />;
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const session = useContext(AuthContext);
  const permissions = session?.permissions ?? [];
  return {
    user: session?.user ?? null,
    signedIn: Boolean(session),
    can: (code) => permissions.includes('*') || permissions.includes(code),
  };
}
