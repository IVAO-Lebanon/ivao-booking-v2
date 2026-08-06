import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthConfig } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * Build the IVAO OAuth authorize URL, or null if SSO isn't configured (no client
 * id or authorization endpoint). Env vars win over the server-provided config.
 */
export function buildIvaoAuthUrl(config: AuthConfig | null): string | null {
  const clientId = import.meta.env.VITE_IVAO_CLIENT_ID || config?.clientId;
  const authEndpoint = config?.openId?.authorizationEndpoint;
  if (!clientId || !authEndpoint) return null;
  const redirectUri = import.meta.env.VITE_IVAO_REDIRECT_URI || `${window.location.origin}/login/callback`;
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'profile email',
  });
  return `${authEndpoint}?${query.toString()}`;
}

/**
 * Returns a function that starts sign-in. In production it jumps straight to IVAO
 * (no intermediate page). Dev builds, or servers without SSO configured, fall back
 * to the /login page (which carries the developer login form).
 */
export function useIvaoSignIn() {
  const { config } = useAuth();
  const navigate = useNavigate();
  return useCallback(() => {
    if (config?.devAuth) {
      navigate('/login');
      return;
    }
    const url = buildIvaoAuthUrl(config);
    if (url) window.location.href = url;
    else navigate('/login');
  }, [config, navigate]);
}
