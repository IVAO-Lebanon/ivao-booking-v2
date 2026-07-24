import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { aircraftSchema } from '../validation/schemas.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, offset } = parsePagination(req.query, 25);
    const total = (await query('SELECT COUNT(*) c FROM aircraft'))[0].c;
    const rows = await query(`SELECT * FROM aircraft ORDER BY icao LIMIT ${perPage} OFFSET ${offset}`);
    res.json(paginated(rows, total, page, perPage));
  })
);

// Aircraft referenced by slots but not present in the aircraft table (efficient SQL,
// replacing the original in-memory "load all slots" implementation).
router.get(
  '/missing',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT s.aircraft AS icao, COUNT(*) AS count
       FROM slots s LEFT JOIN aircraft a ON a.icao = s.aircraft
       WHERE s.aircraft IS NOT NULL AND a.id IS NULL
       GROUP BY s.aircraft ORDER BY count DESC`
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = aircraftSchema.parse({ ...req.body, icao: String(req.body.icao || '').toUpperCase() });
    try {
      const result = await query(
        `INSERT INTO aircraft (icao, iata, name, speed) VALUES (:icao,:iata,:name,:speed)`,
        data
      );
      await audit(req.user.id, 'create', 'aircraft', result.insertId);
      res.status(201).json(await queryOne('SELECT * FROM aircraft WHERE id=:id', { id: result.insertId }));
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new ApiError(422, 'aircraft.duplicate');
      throw err;
    }
  })
);

router.put(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT id FROM aircraft WHERE id=:id', { id: req.params.id });
    if (!existing) throw new ApiError(404, 'aircraft.notFound');
    const data = aircraftSchema.parse({ ...req.body, icao: String(req.body.icao || '').toUpperCase() });
    await query(`UPDATE aircraft SET icao=:icao, iata=:iata, name=:name, speed=:speed WHERE id=:id`, {
      ...data,
      id: existing.id,
    });
    await audit(req.user.id, 'update', 'aircraft', existing.id);
    res.json(await queryOne('SELECT * FROM aircraft WHERE id=:id', { id: existing.id }));
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT id FROM aircraft WHERE id=:id', { id: req.params.id });
    if (!existing) throw new ApiError(404, 'aircraft.notFound');
    await query('DELETE FROM aircraft WHERE id=:id', { id: existing.id });
    await audit(req.user.id, 'delete', 'aircraft', existing.id);
    res.status(204).end();
  })
);

export default router;
