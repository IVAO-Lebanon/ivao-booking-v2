import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { audit } from '../utils/audit.js';
import { invalidateCustomData } from '../services/customData.js';
import {
  customAirportSchema,
  customAirportUpdateSchema,
  customAircraftSchema,
  customAircraftUpdateSchema,
} from '../validation/schemas.js';

const router = Router();
const adminOnly = [requireAuth, requireAdmin];

// ── Custom airports ──────────────────────────────────────────────────────────
router.get(
  '/airport',
  ...adminOnly,
  asyncHandler(async (_req, res) => {
    res.json(
      await query(
        'SELECT icao, iata, name, city, countryId, latitude, longitude, elevation FROM custom_airports ORDER BY icao ASC'
      )
    );
  })
);

router.post(
  '/airport',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const data = customAirportSchema.parse(req.body);
    if (await queryOne('SELECT icao FROM custom_airports WHERE icao=:c', { c: data.icao }))
      throw new ApiError(409, 'customAirport.duplicate');
    await query(
      `INSERT INTO custom_airports (icao, iata, name, city, countryId, latitude, longitude, elevation, createdBy)
       VALUES (:icao,:iata,:name,:city,:countryId,:latitude,:longitude,:elevation,:createdBy)`,
      { ...data, createdBy: req.user.id }
    );
    invalidateCustomData();
    await audit(req.user.id, 'create', 'customAirport', data.icao, { name: data.name });
    res.status(201).json(data);
  })
);

router.put(
  '/airport/:icao',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const icao = String(req.params.icao).toUpperCase();
    if (!(await queryOne('SELECT icao FROM custom_airports WHERE icao=:c', { c: icao })))
      throw new ApiError(404, 'customAirport.notFound');
    const data = customAirportUpdateSchema.parse(req.body);
    await query(
      `UPDATE custom_airports SET iata=:iata, name=:name, city=:city, countryId=:countryId,
        latitude=:latitude, longitude=:longitude, elevation=:elevation WHERE icao=:icao`,
      { ...data, icao }
    );
    invalidateCustomData();
    await audit(req.user.id, 'update', 'customAirport', icao, { name: data.name });
    res.json({ icao, ...data });
  })
);

router.delete(
  '/airport/:icao',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const icao = String(req.params.icao).toUpperCase();
    if (!(await queryOne('SELECT icao FROM custom_airports WHERE icao=:c', { c: icao })))
      throw new ApiError(404, 'customAirport.notFound');
    await query('DELETE FROM custom_airports WHERE icao=:c', { c: icao });
    invalidateCustomData();
    await audit(req.user.id, 'delete', 'customAirport', icao, null);
    res.json({ ok: true });
  })
);

// ── Custom aircraft ──────────────────────────────────────────────────────────
router.get(
  '/aircraft',
  ...adminOnly,
  asyncHandler(async (_req, res) => {
    res.json(await query('SELECT icao, iata, model, manufacturer, wtc FROM custom_aircraft ORDER BY icao ASC'));
  })
);

router.post(
  '/aircraft',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const data = customAircraftSchema.parse(req.body);
    if (await queryOne('SELECT icao FROM custom_aircraft WHERE icao=:c', { c: data.icao }))
      throw new ApiError(409, 'customAircraft.duplicate');
    await query(
      `INSERT INTO custom_aircraft (icao, iata, model, manufacturer, wtc, createdBy)
       VALUES (:icao,:iata,:model,:manufacturer,:wtc,:createdBy)`,
      { ...data, createdBy: req.user.id }
    );
    invalidateCustomData();
    await audit(req.user.id, 'create', 'customAircraft', data.icao, { model: data.model });
    res.status(201).json(data);
  })
);

router.put(
  '/aircraft/:icao',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const icao = String(req.params.icao).toUpperCase();
    if (!(await queryOne('SELECT icao FROM custom_aircraft WHERE icao=:c', { c: icao })))
      throw new ApiError(404, 'customAircraft.notFound');
    const data = customAircraftUpdateSchema.parse(req.body);
    await query('UPDATE custom_aircraft SET iata=:iata, model=:model, manufacturer=:manufacturer, wtc=:wtc WHERE icao=:icao', {
      ...data,
      icao,
    });
    invalidateCustomData();
    await audit(req.user.id, 'update', 'customAircraft', icao, { model: data.model });
    res.json({ icao, ...data });
  })
);

router.delete(
  '/aircraft/:icao',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const icao = String(req.params.icao).toUpperCase();
    if (!(await queryOne('SELECT icao FROM custom_aircraft WHERE icao=:c', { c: icao })))
      throw new ApiError(404, 'customAircraft.notFound');
    await query('DELETE FROM custom_aircraft WHERE icao=:c', { c: icao });
    invalidateCustomData();
    await audit(req.user.id, 'delete', 'customAircraft', icao, null);
    res.json({ ok: true });
  })
);

export default router;
