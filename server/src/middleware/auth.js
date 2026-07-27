import { verifyToken } from '../auth/jwt.js';
import { queryOne } from '../db/pool.js';
import { ApiError } from './error.js';

/** Loads the authenticated user onto req.user from the Bearer token. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'auth.unauthorized');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new ApiError(401, 'auth.invalidToken');
    }

    const user = await queryOne('SELECT * FROM users WHERE id = :id', { id: payload.id });
    if (!user) throw new ApiError(401, 'auth.unauthorized');

    req.user = normalizeUser(user);
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth - attaches req.user if a valid token is present, otherwise continues. */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyToken(token);
      const user = await queryOne('SELECT * FROM users WHERE id = :id', { id: payload.id });
      if (user) req.user = normalizeUser(user);
    } catch {
      /* ignore - treated as anonymous */
    }
  }
  next();
}

/** Requires the authenticated user to be an admin. */
export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'auth.unauthorized'));
  if (!req.user.isAdmin) return next(new ApiError(403, 'admin.noAdmin'));
  next();
}

export function normalizeUser(row) {
  return {
    ...row,
    isAdmin: Boolean(row.isAdmin),
    suspended: Boolean(row.suspended),
  };
}
