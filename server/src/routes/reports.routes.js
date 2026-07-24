import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { toCsv } from '../utils/csv.js';

const router = Router();

// Export all slots of an event as CSV (admin).
router.get(
  '/event/:eventId/export',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const event = await queryOne('SELECT * FROM events WHERE id=:id', { id: req.params.eventId });
    if (!event) throw new ApiError(404, 'event.notFound');

    const rows = await query(
      `SELECT s.id, s.flightNumber, s.origin, s.destination, s.slotTime, s.gate, s.aircraft,
              s.bookingStatus, u.vid AS owner
       FROM slots s LEFT JOIN users u ON u.id = s.pilotId
       WHERE s.eventId = :e ORDER BY s.slotTime ASC, s.id ASC`,
      { e: event.id }
    );

    const csv = toCsv(
      ['id', 'flightNumber', 'origin', 'destination', 'slotTime', 'gate', 'aircraft', 'bookingStatus', 'owner'],
      rows
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="event_${event.id}_slots.csv"`);
    res.send(csv);
  })
);

// Lightweight dashboard stats for admins.
router.get(
  '/stats',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [{ c: events }] = await query('SELECT COUNT(*) c FROM events');
    const [{ c: upcoming }] = await query(
      "SELECT COUNT(*) c FROM events WHERE dateEnd >= UTC_TIMESTAMP() AND status='scheduled'"
    );
    const [{ c: users }] = await query('SELECT COUNT(*) c FROM users');
    const [{ c: suspended }] = await query('SELECT COUNT(*) c FROM users WHERE suspended=1');
    const [{ c: slots }] = await query('SELECT COUNT(*) c FROM slots');
    const [{ c: booked }] = await query("SELECT COUNT(*) c FROM slots WHERE bookingStatus<>'free'");
    res.json({ events, upcoming, users, suspended, slots, booked });
  })
);

export default router;
