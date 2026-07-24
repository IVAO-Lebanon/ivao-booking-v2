import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { getRoutes, getTextureImage, getAirlineTextures, hasApiKey } from '../ivao/dataApi.js';

const router = Router();

// Pick the best current livery: skip old/retro/special-event/cargo variants, then
// take the newest (highest id). Falls back to any active texture.
function pickLivery(textures) {
  const active = (textures || []).filter((t) => t && t.active);
  const bad = /\b(old|retro|vintage|classic|special|years|anniversary|cargo|freighter|sticker|prototype|test|no ?title|untitled|unmarked|blank|white|house)\b/i;
  let pool = active.filter((t) => !bad.test(t.name || ''));
  if (!pool.length) pool = active;
  pool.sort((a, b) => b.id - a.id);
  return pool[0] || null;
}

// Aircraft typeahead over the synced catalogue.
router.get(
  '/aircraft',
  asyncHandler(async (req, res) => {
    const q = String(req.query.search || '').trim();
    if (q.length < 1) return res.json([]);
    try {
      const rows = await query(
        `SELECT icao, iata, model, description, wtc, manufacturer FROM aircraft_ref
         WHERE icao LIKE :prefix OR model LIKE :contains
         ORDER BY (icao = :exact) DESC, icao LIMIT 20`,
        { prefix: `${q.toUpperCase()}%`, contains: `%${q}%`, exact: q.toUpperCase() }
      );
      res.json(rows);
    } catch {
      res.json([]);
    }
  })
);

// Single aircraft type (for the flight detail view).
router.get(
  '/aircraft/:icao',
  asyncHandler(async (req, res) => {
    const icao = String(req.params.icao || '').toUpperCase();
    try {
      const row = await queryOne('SELECT icao, iata, model, description, wtc, manufacturer FROM aircraft_ref WHERE icao = :i', { i: icao });
      res.json(row || { icao, available: false });
    } catch {
      res.json({ icao, available: false });
    }
  })
);

// IVAO-published routes between two airports.
router.get(
  '/route',
  asyncHandler(async (req, res) => {
    const dep = String(req.query.dep || '').toUpperCase();
    const arr = String(req.query.arr || '').toUpperCase();
    if (!/^[A-Z]{4}$/.test(dep) || !/^[A-Z]{4}$/.test(arr)) throw new ApiError(422, 'airport.invalidIcao');
    if (!hasApiKey()) return res.json({ available: false, routes: [] });
    try {
      const items = await getRoutes(dep, arr);
      res.json({ available: true, routes: items });
    } catch {
      res.json({ available: true, routes: [] });
    }
  })
);

// Resolve the best livery for an airline + aircraft (ICAO), independent of any
// live session. Returns the chosen texture id + name for the flight-detail view.
router.get(
  '/livery',
  asyncHandler(async (req, res) => {
    const airline = String(req.query.airline || '').toUpperCase();
    const aircraft = String(req.query.aircraft || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(airline) || !aircraft || !hasApiKey()) return res.json({ available: false });
    try {
      const list = await getAirlineTextures(airline);
      const acft = (Array.isArray(list) ? list : []).find((a) => String(a.icaoCode).toUpperCase() === aircraft);
      const tex = pickLivery(acft?.aircraftTextures);
      if (!tex) return res.json({ available: false });
      res.json({ available: true, textureId: tex.id, name: tex.name });
    } catch {
      res.json({ available: false });
    }
  })
);

// Proxies an MTL livery render (needs the apiKey, so it can't be fetched directly
// by the browser). Used to show the actual livery a live pilot is flying.
router.get(
  '/texture/:id/image',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id).replace(/\D/g, '');
    if (!id || !hasApiKey()) return res.status(404).end();
    const img = await getTextureImage(id);
    if (!img) return res.status(404).end();
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(img.buffer);
  })
);

export default router;
