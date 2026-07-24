import { config } from '../config.js';

let cachedOpenId = null;

/** Fetch (and cache) IVAO's OpenID configuration. */
export async function getOpenIdConfig() {
  if (cachedOpenId) return cachedOpenId;
  const res = await fetch(config.ivao.openidConfig);
  if (!res.ok) throw new Error('Failed to load IVAO OpenID configuration');
  cachedOpenId = await res.json();
  return cachedOpenId;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForToken(code, redirectUri, codeVerifier = '') {
  const openId = await getOpenIdConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.ivao.clientId,
    client_secret: config.ivao.clientSecret,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const res = await fetch(openId.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('IVAO token exchange failed');
  return res.json();
}

/** base64url-safe decode of a JWT segment (fixes the base64 bug in the original). */
function decodeJwtSegment(segment) {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function extractSubFromAccessToken(accessToken) {
  const parts = String(accessToken || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = decodeJwtSegment(parts[1]);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Fetch the OIDC userinfo (for the email claim, when the `email` scope is granted). */
export async function getEmailFromUserInfo(accessToken) {
  try {
    const openId = await getOpenIdConfig();
    if (!openId.userinfo_endpoint) return null;
    const res = await fetch(openId.userinfo_endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const info = await res.json();
    return info.email || info.publicEmail || null;
  } catch {
    return null;
  }
}

/** Fetch IVAO user info from the HQ API. */
export async function getIvaoUserInfo(sub) {
  const res = await fetch(`${config.ivao.apiEndpoint}/users/${sub}`, {
    headers: { apiKey: config.ivao.apiKey },
  });
  if (!res.ok) throw new Error('Failed to fetch IVAO user info');
  return res.json();
}

/**
 * Determine whether an IVAO user may administer this division instance.
 * A "0" in a configured position pattern is a numeric wildcard (e.g. XA0 → XA1, XA2…).
 * The full position id (e.g. "LB-DIR") is anchored so partial matches can't grant access
 * (fixes the un-anchored regex bug in the original).
 */
export function canAccessAdmin(ivaoUser) {
  const positions = ivaoUser?.userStaffPositions;
  if (!Array.isArray(positions) || positions.length === 0) return false;

  const patterns = config.authorizedStaffPositions.map((p) => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/0/g, '[0-9]');
    return `${config.division}-${escaped}`;
  });
  const regex = new RegExp(`^(?:${patterns.join('|')})$`);

  return positions.some((pos) => regex.test(pos?.id ?? ''));
}
