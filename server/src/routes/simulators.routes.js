import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { simulatorSchema, simulatorUpdateSchema } from '../validation/schemas.js';
import { audit } from '../utils/audit.js';

const router = Router();

// List all simulators (public - used by the scenery form).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query('SELECT code, name, sortOrder FROM simulators ORDER BY sortOrder ASC, name ASC');
    res.json(rows);
  })
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = simulatorSchema.parse(req.body);
    const existing = await queryOne('SELECT code FROM simulators WHERE code=:c', { c: data.code });
    if (existing) throw new ApiError(409, 'simulator.duplicate');
    await query('INSERT INTO simulators (code, name, sortOrder) VALUES (:code, :name, :sortOrder)', data);
    await audit(req.user.id, 'create', 'simulator', data.code, { name: data.name });
    res.status(201).json(data);
  })
);

router.put(
  '/:code',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const code = String(req.params.code).toLowerCase();
    const existing = await queryOne('SELECT code FROM simulators WHERE code=:c', { c: code });
    if (!existing) throw new ApiError(404, 'simulator.notFound');
    const data = simulatorUpdateSchema.parse(req.body);
    await query('UPDATE simulators SET name=:name, sortOrder=:sortOrder WHERE code=:code', { ...data, code });
    await audit(req.user.id, 'update', 'simulator', code, { name: data.name });
    res.json({ code, ...data });
  })
);

router.delete(
  '/:code',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const code = String(req.params.code).toLowerCase();
    const existing = await queryOne('SELECT code FROM simulators WHERE code=:c', { c: code });
    if (!existing) throw new ApiError(404, 'simulator.notFound');
    const inUse = await queryOne('SELECT COUNT(*) AS c FROM sceneries WHERE simulator=:c', { c: code });
    if (inUse.c > 0) throw new ApiError(409, 'simulator.inUse');
    await query('DELETE FROM simulators WHERE code=:c', { c: code });
    await audit(req.user.id, 'delete', 'simulator', code, null);
    res.json({ ok: true });
  })
);

export default router;
