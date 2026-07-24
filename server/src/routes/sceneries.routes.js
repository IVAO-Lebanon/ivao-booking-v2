import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { scenerySchema } from '../validation/schemas.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';

const router = Router();

async function assertSimulatorExists(code) {
  const s = await queryOne('SELECT code FROM simulators WHERE code = :c', { c: code });
  if (!s) throw new ApiError(400, 'scenery.invalidSimulator');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, offset } = parsePagination(req.query, 10);
    const params = {};
    let where = '';
    if (req.query.icao) {
      params.icao = String(req.query.icao).toUpperCase();
      where = 'WHERE icao = :icao';
    }
    const total = (await query(`SELECT COUNT(*) c FROM sceneries ${where}`, params))[0].c;
    const rows = await query(
      `SELECT * FROM sceneries ${where} ORDER BY icao, title LIMIT ${perPage} OFFSET ${offset}`,
      params
    );
    res.json(paginated(rows, total, page, perPage));
  })
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = scenerySchema.parse({ ...req.body, icao: String(req.body.icao || '').toUpperCase() });
    await assertSimulatorExists(data.simulator);
    const result = await query(
      `INSERT INTO sceneries (icao, title, license, link, simulator) VALUES (:icao,:title,:license,:link,:simulator)`,
      data
    );
    await audit(req.user.id, 'create', 'scenery', result.insertId);
    res.status(201).json(await queryOne('SELECT * FROM sceneries WHERE id=:id', { id: result.insertId }));
  })
);

router.put(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT id FROM sceneries WHERE id=:id', { id: req.params.id });
    if (!existing) throw new ApiError(404, 'scenery.notFound');
    const data = scenerySchema.parse({ ...req.body, icao: String(req.body.icao || '').toUpperCase() });
    await assertSimulatorExists(data.simulator);
    await query(
      `UPDATE sceneries SET icao=:icao, title=:title, license=:license, link=:link, simulator=:simulator WHERE id=:id`,
      { ...data, id: existing.id }
    );
    await audit(req.user.id, 'update', 'scenery', existing.id);
    res.json(await queryOne('SELECT * FROM sceneries WHERE id=:id', { id: existing.id }));
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT id FROM sceneries WHERE id=:id', { id: req.params.id });
    if (!existing) throw new ApiError(404, 'scenery.notFound');
    await query('DELETE FROM sceneries WHERE id=:id', { id: existing.id });
    await audit(req.user.id, 'delete', 'scenery', existing.id);
    res.status(204).end();
  })
);

export default router;
