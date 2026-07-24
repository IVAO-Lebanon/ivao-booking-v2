import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { getAirport, getAirportBrief, hasApiKey } from '../ivao/dataApi.js';

const router = Router();

function assertIcao(raw) {
  const icao = String(raw || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(icao)) throw new ApiError(422, 'airport.invalidIcao');
  return icao;
}

// Typeahead search over the synced airport catalogue (by ICAO or name).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.search || '').trim();
    if (q.length < 2) return res.json([]);
    try {
      const rows = await query(
        `SELECT icao, iata, name, city, countryId FROM airports_ref
         WHERE icao LIKE :prefix OR name LIKE :contains
         ORDER BY (icao = :exact) DESC, (icao LIKE :prefix) DESC, name LIMIT 20`,
        { prefix: `${q.toUpperCase()}%`, contains: `%${q}%`, exact: q.toUpperCase() }
      );
      res.json(rows);
    } catch {
      res.json([]); // reference table not synced yet
    }
  })
);

// Raw airport record (back-compat).
router.get(
  '/details/:icao',
  asyncHandler(async (req, res) => {
    const icao = assertIcao(req.params.icao);
    if (!hasApiKey()) return res.json({ icao, name: icao, available: false });
    try {
      const data = await getAirport(icao);
      if (!data) throw new ApiError(404, 'airport.notFound');
      res.json(data);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(502, 'airport.requestFailed');
    }
  })
);

// Airport essentials + live METAR/TAF for the flight detail view.
router.get(
  '/:icao/brief',
  asyncHandler(async (req, res) => {
    const icao = assertIcao(req.params.icao);
    if (!hasApiKey()) return res.json({ icao, available: false, metar: null, taf: null });
    try {
      res.json(await getAirportBrief(icao));
    } catch {
      throw new ApiError(502, 'airport.requestFailed');
    }
  })
);

export default router;
