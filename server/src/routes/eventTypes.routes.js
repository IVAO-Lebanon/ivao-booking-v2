import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { eventTypeSchema, eventTypeUpdateSchema } from '../validation/schemas.js';
import { audit } from '../utils/audit.js';

const router = Router();

function shape(row) {
  return {
    code: row.code,
    name: row.name,
    description: row.description,
    opsSlots: !!row.opsSlots,
    sortOrder: row.sortOrder,
  };
}

// List all event types (public — needed to render event forms and labels).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query('SELECT * FROM event_types ORDER BY sortOrder ASC, name ASC');
    res.json(rows.map(shape));
  })
);

// Create (admin).
router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = eventTypeSchema.parse(req.body);
    const existing = await queryOne('SELECT code FROM event_types WHERE code = :c', { c: data.code });
    if (existing) throw new ApiError(409, 'eventType.duplicate');

    await query(
      `INSERT INTO event_types (code, name, description, opsSlots, sortOrder)
       VALUES (:code, :name, :description, :opsSlots, :sortOrder)`,
      { ...data, opsSlots: data.opsSlots ? 1 : 0 }
    );
    await audit(req.user.id, 'create', 'eventType', data.code, { name: data.name });
    res.status(201).json(shape({ ...data, opsSlots: data.opsSlots ? 1 : 0 }));
  })
);

// Update (admin) — code is immutable.
router.put(
  '/:code',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const code = String(req.params.code).toLowerCase();
    const existing = await queryOne('SELECT code FROM event_types WHERE code = :c', { c: code });
    if (!existing) throw new ApiError(404, 'eventType.notFound');

    const data = eventTypeUpdateSchema.parse(req.body);
    await query(
      `UPDATE event_types SET name = :name, description = :description, opsSlots = :opsSlots, sortOrder = :sortOrder
       WHERE code = :code`,
      { ...data, opsSlots: data.opsSlots ? 1 : 0, code }
    );
    await audit(req.user.id, 'update', 'eventType', code, { name: data.name });
    res.json(shape({ code, ...data, opsSlots: data.opsSlots ? 1 : 0 }));
  })
);

// Delete (admin). Blocked by an FK if any event still uses the type.
router.delete(
  '/:code',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const code = String(req.params.code).toLowerCase();
    const existing = await queryOne('SELECT code FROM event_types WHERE code = :c', { c: code });
    if (!existing) throw new ApiError(404, 'eventType.notFound');

    const inUse = await queryOne('SELECT COUNT(*) AS c FROM events WHERE type = :c', { c: code });
    if (inUse.c > 0) throw new ApiError(409, 'eventType.inUse');

    await query('DELETE FROM event_types WHERE code = :c', { c: code });
    await audit(req.user.id, 'delete', 'eventType', code, null);
    res.json({ ok: true });
  })
);

export default router;
