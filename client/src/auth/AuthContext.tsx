import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api } from '../api/client';
import type { AuthConfig } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  token: string;
  loading: boolean;
  config: AuthConfig | null;
  isAdmin: boolean;
  signed: boolean;
  devLogin: (vid: string, admin: boolean) => Promise<void>;
  loginWithJwt: (jwt: string) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const TOKEN_KEY = 'ivao_lb_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  // Register a 401 handler once.
  useEffect(() => {
    api.onUnauthorized(() => {
      localStorage.removeItem(TOKEN_KEY);
      setToken('');
      setUser(null);
    });
  }, []);

  // Load public auth config once.
  useEffect(() => {
    api.authConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  // Whenever the token changes, sync it to the client and load the user.
  useEffect(() => {
    api.setToken(token);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .me()
      .then((u) => active && setUser(u))
      .catch(() => {
        if (!active) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUser(null);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const loginWithJwt = useCallback((jwt: string) => {
    localStorage.setItem(TOKEN_KEY, jwt);
    setToken(jwt);
  }, []);

  const devLogin = useCallback(
    async (vid: string, admin: boolean) => {
      const { jwt } = await api.devLogin(vid, admin);
      loginWithJwt(jwt);
    },
    [loginWithJwt]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const u = await api.me();
    setUser(u);
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      config,
      isAdmin: Boolean(user?.isAdmin),
      signed: Boolean(user),
      devLogin,
      loginWithJwt,
      signOut,
      refresh,
    }),
    [user, token, loading, config, devLogin, loginWithJwt, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
