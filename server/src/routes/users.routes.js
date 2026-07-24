import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin, normalizeUser } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { userUpdateSchema } from '../validation/schemas.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { page, perPage, offset } = parsePagination(req.query, 15);
    const where = [];
    const params = {};
    if (req.query.suspended === 'true') where.push('suspended = 1');
    if (req.query.suspended === 'false') where.push('suspended = 0');
    if (req.query.vid) {
      params.vid = String(req.query.vid);
      where.push('vid = :vid');
    }
    if (req.query.search) {
      params.search = `%${req.query.search}%`;
      where.push('(firstName LIKE :search OR lastName LIKE :search OR vid LIKE :search)');
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) c FROM users ${whereSql}`, params))[0].c;
    const rows = await query(
      `SELECT * FROM users ${whereSql} ORDER BY createdAt DESC LIMIT ${perPage} OFFSET ${offset}`,
      params
    );
    res.json(paginated(rows.map(normalizeUser), total, page, perPage));
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await queryOne('SELECT * FROM users WHERE id=:id', { id: req.params.id });
    if (!target) throw new ApiError(404, 'user.notFound');
    if (String(target.id) === String(req.user.id)) throw new ApiError(422, 'user.cannotSuspendSelf');

    const { suspended } = userUpdateSchema.parse(req.body);
    await query('UPDATE users SET suspended=:s WHERE id=:id', { s: suspended ? 1 : 0, id: target.id });
    await audit(req.user.id, suspended ? 'suspend' : 'unsuspend', 'user', target.id);
    res.json(normalizeUser(await queryOne('SELECT * FROM users WHERE id=:id', { id: target.id })));
  })
);

export default router;
