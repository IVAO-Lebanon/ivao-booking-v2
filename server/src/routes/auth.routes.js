import { Router } from 'express';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { signToken } from '../auth/jwt.js';
import { requireAuth, normalizeUser } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { authDevSchema, authIvaoSchema } from '../validation/schemas.js';
import {
  exchangeCodeForToken,
  extractSubFromAccessToken,
  getIvaoUserInfo,
  getEmailFromUserInfo,
  getOpenIdConfig,
  canAccessAdmin,
} from '../auth/ivao.js';

const router = Router();

async function upsertUser(fields) {
  // COALESCE keeps an existing email if this login didn't provide one.
  await query(
    `INSERT INTO users (vid, firstName, lastName, atcRating, pilotRating, email, division, country, isAdmin)
     VALUES (:vid,:firstName,:lastName,:atcRating,:pilotRating,:email,:division,:country,:isAdmin)
     ON DUPLICATE KEY UPDATE
       firstName=VALUES(firstName), lastName=VALUES(lastName), atcRating=VALUES(atcRating),
       pilotRating=VALUES(pilotRating), email=COALESCE(VALUES(email), email),
       division=VALUES(division), country=VALUES(country), isAdmin=VALUES(isAdmin)`,
    { email: null, ...fields }
  );
  return queryOne('SELECT * FROM users WHERE vid = :vid', { vid: fields.vid });
}

// Public: expose the IVAO authorize/token endpoints + client id so the SPA can
// initiate the OAuth flow.
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    let openId = null;
    try {
      const cfg = await getOpenIdConfig();
      openId = {
        authorizationEndpoint: cfg.authorization_endpoint,
        tokenEndpoint: cfg.token_endpoint,
        userInfoEndpoint: cfg.userinfo_endpoint,
      };
    } catch {
      openId = null;
    }
    res.json({
      division: config.division,
      clientId: config.ivao.clientId,
      devAuth: config.devAuth,
      openId,
    });
  })
);

// Production SSO: exchange an IVAO auth code for our session JWT.
router.post(
  '/ivao',
  asyncHandler(async (req, res) => {
    const { code, redirectUri, codeVerifier } = authIvaoSchema.parse(req.body);

    const tokenResponse = await exchangeCodeForToken(code, redirectUri, codeVerifier);
    if (!tokenResponse?.access_token) throw new ApiError(403, 'auth.invalidToken');

    const sub = extractSubFromAccessToken(tokenResponse.access_token);
    if (!sub) throw new ApiError(403, 'auth.invalidToken');

    const ivaoUser = await getIvaoUserInfo(sub);
    const email = await getEmailFromUserInfo(tokenResponse.access_token);
    const user = await upsertUser({
      vid: String(ivaoUser.id),
      firstName: ivaoUser.firstName ?? '',
      lastName: ivaoUser.lastName ?? '',
      atcRating: ivaoUser.rating?.atcRating?.id ?? 0,
      pilotRating: ivaoUser.rating?.pilotRating?.id ?? 0,
      email: email || null,
      division: ivaoUser.divisionId ?? '',
      country: ivaoUser.countryId ?? '',
      isAdmin: canAccessAdmin(ivaoUser) ? 1 : 0,
    });

    res.json({ jwt: signToken({ id: user.id, vid: user.vid }) });
  })
);

// Development only: log in as an arbitrary VID without IVAO credentials.
router.post(
  '/dev',
  asyncHandler(async (req, res) => {
    if (!config.devAuth) throw new ApiError(404, 'route.notFound');
    const data = authDevSchema.parse(req.body);
    const user = await upsertUser({
      vid: data.vid,
      firstName: data.firstName,
      lastName: data.lastName,
      atcRating: 3,
      pilotRating: 4,
      email: `${data.vid}@dev.local`,
      division: config.division,
      country: config.division,
      isAdmin: data.admin ? 1 : 0,
    });
    res.json({ jwt: signToken({ id: user.id, vid: user.vid }) });
  })
);

// Returns the current authenticated user.
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(normalizeUser(req.user));
  })
);

export default router;
