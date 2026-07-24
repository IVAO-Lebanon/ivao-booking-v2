import { Router } from 'express';
import { config } from '../config.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { eventSchema } from '../validation/schemas.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { withEventState } from '../utils/eventState.js';
import { audit } from '../utils/audit.js';

const router = Router();

function tsToMysql(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

async function assertEventTypeExists(code) {
  const t = await queryOne('SELECT code FROM event_types WHERE code = :c', { c: code });
  if (!t) throw new ApiError(400, 'event.invalidType');
}

async function loadAirports(eventId) {
  const rows = await query('SELECT icao FROM event_airports WHERE eventId=:e ORDER BY icao', { e: eventId });
  return rows.map((r) => r.icao);
}

async function loadSceneriesFor(icaos) {
  if (icaos.length === 0) return [];
  const inList = icaos.map((_, i) => `:i${i}`).join(',');
  const params = Object.fromEntries(icaos.map((ic, i) => [`i${i}`, ic]));
  return query(`SELECT * FROM sceneries WHERE icao IN (${inList}) ORDER BY icao, title`, params);
}

async function decorateEvent(event) {
  const airports = await loadAirports(event.id);
  const sceneries = await loadSceneriesFor(airports);
  // Expose the type's display name + ops flag so clients don't hardcode codes.
  const t = await queryOne('SELECT name, opsSlots FROM event_types WHERE code = :c', { c: event.type });
  const typeName = t ? t.name : event.type;
  const opsSlots = !!(t && t.opsSlots);
  return withEventState({ ...event, typeName, opsSlots, airports, sceneries });
}

function validateDates(startTs, endTs) {
  if (endTs <= startTs) throw new ApiError(422, 'event.endBeforeStart');
  const hours = (endTs - startTs) / 3600;
  if (hours > config.rules.maxEventHours) throw new ApiError(422, 'event.tooLong');
}

async function replaceAirports(tx, eventId, airportList) {
  await tx.query('DELETE FROM event_airports WHERE eventId=:e', { e: eventId });
  const icaos = [...new Set(
    String(airportList || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{4}$/.test(s))
  )];
  if (icaos.length === 0) throw new ApiError(422, 'event.noAirports');
  for (const icao of icaos) {
    await tx.query('INSERT INTO event_airports (eventId, icao) VALUES (:e,:i)', { e: eventId, i: icao });
  }
}

// List events. Public sees upcoming + scheduled; admins can pass showAll=true.
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, perPage, offset } = parsePagination(req.query, 6);
    const where = [];
    const params = {};

    const showAll = req.query.showAll === 'true' || req.query.showAll === '1';
    if (showAll) {
      if (!req.user?.isAdmin) throw new ApiError(403, 'admin.noAdmin');
    } else {
      where.push('dateEnd >= UTC_TIMESTAMP()');
      where.push("status <> 'cancelled'");
    }

    if (req.query.status) {
      const statuses = String(req.query.status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) {
        const inList = statuses.map((_, i) => `:st${i}`).join(',');
        statuses.forEach((s, i) => (params[`st${i}`] = s));
        where.push(`status IN (${inList})`);
      }
    }

    if (req.query.type) {
      params.type = String(req.query.type);
      where.push('type = :type');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) c FROM events ${whereSql}`, params))[0].c;
    const rows = await query(
      `SELECT * FROM events ${whereSql} ORDER BY dateStart ASC LIMIT ${perPage} OFFSET ${offset}`,
      params
    );
    const data = await Promise.all(rows.map(decorateEvent));
    res.json(paginated(data, total, page, perPage));
  })
);

// Single event.
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const event = await queryOne('SELECT * FROM events WHERE id=:id', { id: req.params.id });
    if (!event) throw new ApiError(404, 'event.notFound');
    const decorated = await decorateEvent(event);
    if (decorated.hasEnded && !req.user?.isAdmin && event.status !== 'finished') {
      // still visible, but this mirrors original gating for ended non-admin views
    }
    res.json(decorated);
  })
);

// Create (admin).
router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = eventSchema.parse(req.body);
    validateDates(data.dateStart, data.dateEnd);
    await assertEventTypeExists(data.type);

    const event = await transaction(async (tx) => {
      const result = await tx.query(
        `INSERT INTO events
          (division, eventName, description, type, status, dateStart, dateEnd, banner, atcBooking, atcBriefing, pilotBriefing, publicAccess, allowBookingAfterStart, maxBookingsPerPilot, bookingMessage, useIvaoRoutes, createdBy)
         VALUES
          (:division,:eventName,:description,:type,:status,:dateStart,:dateEnd,:banner,:atcBooking,:atcBriefing,:pilotBriefing,:publicAccess,:allowBookingAfterStart,:maxBookingsPerPilot,:bookingMessage,:useIvaoRoutes,:createdBy)`,
        {
          division: req.user.division || config.division,
          eventName: data.eventName,
          description: data.description,
          type: data.type,
          status: data.status,
          dateStart: tsToMysql(data.dateStart),
          dateEnd: tsToMysql(data.dateEnd),
          banner: data.banner,
          atcBooking: data.atcBooking,
          atcBriefing: data.atcBriefing || null,
          pilotBriefing: data.pilotBriefing || null,
          publicAccess: data.publicAccess ? 1 : 0,
          allowBookingAfterStart: data.allowBookingAfterStart ? 1 : 0,
          maxBookingsPerPilot: data.maxBookingsPerPilot,
          bookingMessage: data.bookingMessage || null,
          useIvaoRoutes: data.useIvaoRoutes ? 1 : 0,
          createdBy: req.user.id,
        }
      );
      const id = result.insertId;
      await replaceAirports(tx, id, data.airports);
      return tx.queryOne('SELECT * FROM events WHERE id=:id', { id });
    });

    await audit(req.user.id, 'create', 'event', event.id, { eventName: event.eventName });
    res.status(201).json(await decorateEvent(event));
  })
);

// Update (admin).
router.put(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT * FROM events WHERE id=:id', { id: req.params.id });
    if (!existing) throw new ApiError(404, 'event.notFound');

    const data = eventSchema.parse(req.body);
    validateDates(data.dateStart, data.dateEnd);
    await assertEventTypeExists(data.type);

    await transaction(async (tx) => {
      await tx.query(
        `UPDATE events SET
          eventName=:eventName, description=:description, type=:type, status=:status,
          dateStart=:dateStart, dateEnd=:dateEnd, banner=:banner, atcBooking=:atcBooking,
          atcBriefing=:atcBriefing, pilotBriefing=:pilotBriefing, publicAccess=:publicAccess,
          allowBookingAfterStart=:allowBookingAfterStart, maxBookingsPerPilot=:maxBookingsPerPilot,
          bookingMessage=:bookingMessage, useIvaoRoutes=:useIvaoRoutes
         WHERE id=:id`,
        {
          id: existing.id,
          eventName: data.eventName,
          description: data.description,
          type: data.type,
          status: data.status,
          dateStart: tsToMysql(data.dateStart),
          dateEnd: tsToMysql(data.dateEnd),
          banner: data.banner,
          atcBooking: data.atcBooking,
          atcBriefing: data.atcBriefing || null,
          pilotBriefing: data.pilotBriefing || null,
          publicAccess: data.publicAccess ? 1 : 0,
          allowBookingAfterStart: data.allowBookingAfterStart ? 1 : 0,
          maxBookingsPerPilot: data.maxBookingsPerPilot,
          bookingMessage: data.bookingMessage || null,
          useIvaoRoutes: data.useIvaoRoutes ? 1 : 0,
        }
      );
      await replaceAirports(tx, existing.id, data.airports);
    });

    await audit(req.user.id, 'update', 'event', existing.id);
    const updated = await queryOne('SELECT * FROM events WHERE id=:id', { id: existing.id });
    res.json(await decorateEvent(updated));
  })
);

// Delete (admin).
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT id FROM events WHERE id=:id', { id: req.params.id });
    if (!existing) throw new ApiError(404, 'event.notFound');
    await query('DELETE FROM events WHERE id=:id', { id: existing.id });
    await audit(req.user.id, 'delete', 'event', existing.id);
    res.status(204).end();
  })
);

// Sceneries for an event (grouped by airport).
router.get(
  '/:id/sceneries',
  asyncHandler(async (req, res) => {
    const airports = await loadAirports(req.params.id);
    const sceneries = await loadSceneriesFor(airports);
    const grouped = airports.map((icao) => ({
      icao,
      sceneries: sceneries.filter((s) => s.icao === icao),
    }));
    res.json(grouped);
  })
);

export default router;
