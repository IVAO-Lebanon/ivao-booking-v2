import { Router } from 'express';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { getAirport, getAirportBrief, getMetar, getTaf, searchAirports, hasApiKey } from '../ivao/dataApi.js';
import { mergeAirportSearch, resolveAirport } from '../services/customData.js';

const router = Router();

function assertIcao(raw) {
  const icao = String(raw || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(icao)) throw new ApiError(422, 'airport.invalidIcao');
  return icao;
}

// Typeahead search: custom airports plus the IVAO catalogue, custom overriding IVAO.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.search || '').trim();
    if (q.length < 2) return res.json([]);
    let ivao = [];
    try {
      if (hasApiKey()) ivao = await searchAirports(q);
    } catch {
      ivao = []; // IVAO catalogue unavailable; custom results still work
    }
    res.json(await mergeAirportSearch(ivao, q));
  })
);

// Raw airport record (back-compat). A custom airport overrides the IVAO one.
router.get(
  '/details/:icao',
  asyncHandler(async (req, res) => {
    const icao = assertIcao(req.params.icao);
    const custom = await resolveAirport(icao);
    if (custom) return res.json({ ...custom, available: true });
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

// Airport essentials + live METAR/TAF for the flight detail view. A custom airport
// overrides the IVAO record (name/coords), but weather is still pulled from IVAO
// since a real ICAO may still report even when a division has customised it.
router.get(
  '/:icao/brief',
  asyncHandler(async (req, res) => {
    const icao = assertIcao(req.params.icao);
    const custom = await resolveAirport(icao);
    if (custom) {
      const [metar, taf] = hasApiKey()
        ? await Promise.all([getMetar(icao).catch(() => null), getTaf(icao).catch(() => null)])
        : [null, null];
      return res.json({ ...custom, available: true, metar, taf });
    }
    if (!hasApiKey()) return res.json({ icao, available: false, metar: null, taf: null });
    try {
      res.json(await getAirportBrief(icao));
    } catch {
      throw new ApiError(502, 'airport.requestFailed');
    }
  })
);

export default router;
