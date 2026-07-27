import { Router } from 'express';
import { config } from '../config.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { eventSchema } from '../validation/schemas.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { withEventState } from '../utils/eventState.js';
import { audit } from '../utils/audit.js';
import { getDivisionEvents, hasApiKey } from '../ivao/dataApi.js';

const router = Router();

// Maps a raw IVAO /v1/events entry to the fields the create form needs to prefill.
function shapeIvaoEvent(e) {
  return {
    id: e.id,
    title: e.title || '',
    description: e.description || '',
    startDate: e.startDate || null, // ISO 8601 UTC
    endDate: e.endDate || null,
    imageUrl: e.imageUrl || '',
    infoUrl: e.infoUrl || '',
    airports: Array.isArray(e.airports) ? e.airports : [],
    eventType: e.eventType || '',
    divisions: Array.isArray(e.divisions) ? e.divisions : [],
    routes: Array.isArray(e.routes) ? e.routes : null,
  };
}

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
  const tokens = String(airportList || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  // Reject any non-ICAO token rather than silently dropping it.
  if (tokens.some((t) => !/^[A-Z]{4}$/.test(t))) throw new ApiError(422, 'event.invalidAirport');
  const icaos = [...new Set(tokens)];
  if (icaos.length === 0) throw new ApiError(422, 'event.noAirports');
  for (const icao of icaos) {
    await tx.query('INSERT INTO event_airports (eventId, icao) VALUES (:e,:i)', { e: eventId, i: icao });
  }
}

// A stored UTC DATETIME string ("YYYY-MM-DD HH:mm:ss") to a unix-seconds value.
function mysqlToUnix(v) {
  if (!v) return null;
  const s = String(v).replace(' ', 'T');
  return Math.floor(Date.parse(/Z$/.test(s) ? s : s + 'Z') / 1000);
}

const truthy = (v) => Boolean(Number(v));

// Works out what editing an event would do to its EXISTING bookings, so the admin
// can be warned before saving. `deltaMinutes` is how far the event start moves.
async function computeSideEffects(existing, data, deltaMinutes) {
  const summary = { confirmPending: 0, dateShift: null, overLimit: 0 };

  // Turning confirmation off: any still-provisional bookings become confirmed.
  if (truthy(existing.requireConfirmation) && !data.requireConfirmation) {
    const r = await queryOne("SELECT COUNT(*) c FROM slots WHERE eventId=:e AND bookingStatus='prebooked'", { e: existing.id });
    summary.confirmPending = r ? r.c : 0;
  }

  // Moving the event: slot times are absolute, so they desync unless shifted.
  if (deltaMinutes && Number.isFinite(deltaMinutes)) {
    const r = await queryOne('SELECT COUNT(*) c FROM slots WHERE eventId=:e AND slotTime IS NOT NULL', { e: existing.id });
    const timedSlots = r ? r.c : 0;
    if (timedSlots > 0) summary.dateShift = { deltaMinutes, timedSlots };
  }

  // Lowering the per-pilot cap below what some pilots already hold (informational).
  if (data.maxBookingsPerPilot > 0) {
    const rows = await query(
      `SELECT pilotId FROM slots WHERE eventId=:e AND bookingStatus<>'free' AND pilotId IS NOT NULL
        GROUP BY pilotId HAVING COUNT(*) > :max`,
      { e: existing.id, max: data.maxBookingsPerPilot }
    );
    summary.overLimit = rows.length;
  }

  return summary;
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
      // Non-public events are staff-only, even in the normal (non-admin) listing.
      if (!req.user?.isAdmin) where.push('publicAccess = 1');
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
// IVAO event catalogue for this division (admin only) - used to prefill the create form.
router.get(
  '/ivao/import',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!hasApiKey()) throw new ApiError(503, 'ivao.noApiKey');
    const events = await getDivisionEvents(config.division);
    res.json({ division: config.division, events: events.map(shapeIvaoEvent) });
  })
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const event = await queryOne('SELECT * FROM events WHERE id=:id', { id: req.params.id });
    if (!event) throw new ApiError(404, 'event.notFound');
    // Private events are only reachable by staff.
    if (!event.publicAccess && !req.user?.isAdmin) throw new ApiError(404, 'event.notFound');
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
          (division, eventName, description, type, status, dateStart, dateEnd, banner, atcBooking, atcBriefing, pilotBriefing, publicAccess, allowBookingAfterStart, maxBookingsPerPilot, bookingMessage, useIvaoRoutes, requireConfirmation, confirmOpensHoursBefore, confirmDeadlineHours, createdBy)
         VALUES
          (:division,:eventName,:description,:type,:status,:dateStart,:dateEnd,:banner,:atcBooking,:atcBriefing,:pilotBriefing,:publicAccess,:allowBookingAfterStart,:maxBookingsPerPilot,:bookingMessage,:useIvaoRoutes,:requireConfirmation,:confirmOpensHoursBefore,:confirmDeadlineHours,:createdBy)`,
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
          requireConfirmation: data.requireConfirmation ? 1 : 0,
          confirmOpensHoursBefore: data.confirmOpensHoursBefore,
          confirmDeadlineHours: data.confirmDeadlineHours,
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

    // The admin's reconciliation decision rides alongside the event data; zod
    // strips unknown keys, so read it off the raw body.
    const reconcile = req.body && typeof req.body.reconcile === 'object' ? req.body.reconcile : null;

    // How far the event start moves (minutes); used to keep slot times aligned.
    const oldStartUnix = mysqlToUnix(existing.dateStart);
    const deltaMinutes = oldStartUnix == null ? 0 : Math.round((data.dateStart - oldStartUnix) / 60);

    // Work out the side effects on existing bookings, and stop for the admin to
    // confirm the disruptive ones before anything is written.
    const effects = await computeSideEffects(existing, data, deltaMinutes);
    const needsConfirm = effects.confirmPending > 0 || Boolean(effects.dateShift);
    if (needsConfirm && !reconcile) throw new ApiError(409, 'event.reconcileRequired', effects);

    const applied = await transaction(async (tx) => {
      await tx.query(
        `UPDATE events SET
          eventName=:eventName, description=:description, type=:type, status=:status,
          dateStart=:dateStart, dateEnd=:dateEnd, banner=:banner, atcBooking=:atcBooking,
          atcBriefing=:atcBriefing, pilotBriefing=:pilotBriefing, publicAccess=:publicAccess,
          allowBookingAfterStart=:allowBookingAfterStart, maxBookingsPerPilot=:maxBookingsPerPilot,
          bookingMessage=:bookingMessage, useIvaoRoutes=:useIvaoRoutes,
          requireConfirmation=:requireConfirmation, confirmOpensHoursBefore=:confirmOpensHoursBefore,
          confirmDeadlineHours=:confirmDeadlineHours
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
          requireConfirmation: data.requireConfirmation ? 1 : 0,
          confirmOpensHoursBefore: data.confirmOpensHoursBefore,
          confirmDeadlineHours: data.confirmDeadlineHours,
        }
      );
      await replaceAirports(tx, existing.id, data.airports);

      // Confirmation turned off: nothing left to confirm, so provisional bookings
      // become confirmed straight away.
      let confirmedPending = 0;
      if (truthy(existing.requireConfirmation) && !data.requireConfirmation) {
        const r = await tx.query(
          "UPDATE slots SET bookingStatus='booked' WHERE eventId=:e AND bookingStatus='prebooked'",
          { e: existing.id }
        );
        confirmedPending = r?.affectedRows || 0;
      }

      // Event moved and the admin chose to keep the schedule aligned: shift every
      // timed slot by the same amount (same pattern as the bulk "shift" action).
      let slotsShifted = 0;
      if (effects.dateShift && reconcile?.shiftSlots) {
        const r = await tx.query(
          'UPDATE slots SET slotTime=DATE_ADD(slotTime, INTERVAL :m MINUTE) WHERE eventId=:e AND slotTime IS NOT NULL',
          { e: existing.id, m: effects.dateShift.deltaMinutes }
        );
        slotsShifted = r?.affectedRows || 0;
      }

      return { confirmedPending, slotsShifted };
    });

    await audit(req.user.id, 'update', 'event', existing.id);
    const updated = await queryOne('SELECT * FROM events WHERE id=:id', { id: existing.id });

    // Cancelling never emails anyone. If staff want to notify pilots, they send a
    // Cancellation notice manually from the event's Email page.
    const decorated = await decorateEvent(updated);
    res.json({ ...decorated, applied: { ...applied, overLimit: effects.overLimit } });
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
