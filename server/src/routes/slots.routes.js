import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { query, queryOne, transaction } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { slotSchema, bookSchema, bulkSlotSchema } from '../validation/schemas.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { ruleFor } from '../utils/slotRules.js';
import { findConflict } from '../utils/overlap.js';
import { eventState } from '../utils/eventState.js';
import { parseCsv, toCsv } from '../utils/csv.js';
import { audit } from '../utils/audit.js';
import { unknownAirports } from '../ivao/dataApi.js';
import { customAirportIcaoSet } from '../services/customData.js';

// Airport codes that are neither in the IVAO catalogue NOR a staff-defined custom
// airport. Custom airports count as known so slots can use event-only/fictional fields.
async function unknownAirportsExcludingCustom(icaos) {
  const bad = await unknownAirports(icaos);
  if (!bad.size) return bad;
  const custom = await customAirportIcaoSet();
  return new Set([...bad].filter((c) => !custom.has(String(c).toUpperCase())));
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

// Throttle booking actions per authenticated user (falls back to IP) to curb abuse
// and brute-force attempts against slots. Applied after requireAuth so req.user is set.
const bookingLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `u${req.user.id}` : req.ip),
});

const FILTERABLE = ['flightNumber', 'origin', 'destination', 'aircraft', 'gate'];

function normalizeSlotInput(body) {
  const clean = {};
  for (const [k, v] of Object.entries(body)) {
    clean[k] = typeof v === 'string' && v.trim() === '' ? null : v;
    if (typeof clean[k] === 'string' && ['flightNumber', 'origin', 'destination', 'aircraft'].includes(k)) {
      clean[k] = clean[k].toUpperCase();
    }
  }
  return clean;
}

async function getEventOr404(eventId) {
  const event = await queryOne('SELECT * FROM events WHERE id=:id', { id: eventId });
  if (!event) throw new ApiError(404, 'event.notFound');
  return event;
}

/* ─────────────────────────── LIST ─────────────────────────── */
router.get(
  '/event/:eventId/slot',
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const { page, perPage, offset } = parsePagination(req.query, 15);

    const where = ['s.eventId = :eventId'];
    const params = { eventId: event.id };

    if (req.query.available === 'true') {
      where.push("s.bookingStatus = 'free' AND s.pilotId IS NULL");
    }
    if (req.query.airline) {
      params.airline = `${String(req.query.airline).toUpperCase()}%`;
      where.push('s.flightNumber LIKE :airline');
    }
    for (const field of FILTERABLE) {
      if (req.query[field]) {
        params[field] = `%${req.query[field]}%`;
        where.push(`s.${field} LIKE :${field}`);
      }
    }
    if (req.query.private === 'true') where.push('s.isPrivate = 1');
    if (req.query.private === 'false') where.push('s.isPrivate = 0');

    // Event-type "type" filter (takeoff/landing/private/…).
    if (req.query.type) {
      const rule = await ruleFor(event.type);
      const { sql, params: typeParams } = await rule.buildTypeFilter(event.id, String(req.query.type));
      if (sql) {
        // strip the leading " AND " and re-add against alias
        where.push(sql.replace(/^\s*AND\s*/i, '').replace(/\b(origin|destination|isPrivate|isFixedOrigin|isFixedDestination)\b/g, 's.$1'));
        Object.assign(params, typeParams);
      }
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await query(`SELECT COUNT(*) c FROM slots s ${whereSql}`, params))[0].c;
    const rows = await query(
      `SELECT s.*, u.vid AS ownerVid, u.firstName AS ownerFirstName, u.lastName AS ownerLastName
       FROM slots s LEFT JOIN users u ON u.id = s.pilotId
       ${whereSql}
       ORDER BY s.slotTime IS NULL, s.slotTime ASC, s.id ASC
       LIMIT ${perPage} OFFSET ${offset}`,
      params
    );
    const { pastConfirmDeadline } = eventState(event);
    res.json(paginated(rows.map((r) => shapeSlot(r, { pastConfirmDeadline })), total, page, perPage));
  })
);

function shapeSlot(row, opts = {}) {
  const owner = row.pilotId
    ? { vid: row.ownerVid, firstName: row.ownerFirstName, lastName: row.ownerLastName }
    : null;
  const { ownerVid, ownerFirstName, ownerLastName, ...slot } = row;
  // A slot is "claimable" when it is still provisional (prebooked) and the event has
  // passed its claim deadline: the holder keeps it, but another pilot may take it over.
  const claimable = Boolean(opts.pastConfirmDeadline) && slot.bookingStatus === 'prebooked';
  return {
    ...slot,
    isFixedFlightNumber: Boolean(slot.isFixedFlightNumber),
    isFixedOrigin: Boolean(slot.isFixedOrigin),
    isFixedDestination: Boolean(slot.isFixedDestination),
    isFixedSlotTime: Boolean(slot.isFixedSlotTime),
    isFixedAircraft: Boolean(slot.isFixedAircraft),
    isPrivate: Boolean(slot.isPrivate),
    claimable,
    owner,
  };
}

/* ─────────────────────────── COUNTS ─────────────────────────── */
router.get(
  '/event/:eventId/slot/count',
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const rule = await ruleFor(event.type);
    res.json(await rule.getCounts(event.id));
  })
);

/* ─────────────────────────── MY SLOTS ─────────────────────────── */
router.get(
  '/event/:eventId/slot/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const { page, perPage, offset } = parsePagination(req.query, 10);
    const params = { eventId: event.id, pilotId: req.user.id };
    let extra = '';
    if (req.query.flightNumber) {
      params.fn = String(req.query.flightNumber).toUpperCase();
      extra = ' AND flightNumber = :fn';
    }
    const total = (
      await query(`SELECT COUNT(*) c FROM slots WHERE eventId=:eventId AND pilotId=:pilotId ${extra}`, params)
    )[0].c;
    const rows = await query(
      `SELECT * FROM slots WHERE eventId=:eventId AND pilotId=:pilotId ${extra}
       ORDER BY slotTime ASC LIMIT ${perPage} OFFSET ${offset}`,
      params
    );
    const { pastConfirmDeadline } = eventState(event);
    res.json(paginated(rows.map((r) => shapeSlot(r, { pastConfirmDeadline })), total, page, perPage));
  })
);

/* ─────────────────────────── TEMPLATE ─────────────────────────── */
router.get(
  '/event/:eventId/slot/template',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const csv = toCsv(
      ['flightNumber', 'origin', 'destination', 'aircraft', 'gate', 'slotTime'],
      [
        { flightNumber: 'BAW201', origin: 'EGLL', destination: 'LFPG', aircraft: 'A320', gate: 'B4', slotTime: '2026-08-01 16:00:00' },
        { flightNumber: '', origin: 'EGLL', destination: '', aircraft: '', gate: '', slotTime: '2026-08-01 16:30:00' },
      ]
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="slot_template.csv"');
    res.send(csv);
  })
);

/* ─────────────────────────── OVERLAPPING (admin) ─────────────────────────── */
router.get(
  '/event/:eventId/slot/overlapping',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const rows = await query(
      `SELECT s.*, u.vid AS ownerVid FROM slots s JOIN users u ON u.id = s.pilotId
       WHERE s.eventId=:e AND s.bookingStatus <> 'free'`,
      { e: event.id }
    );
    const byPilot = new Map();
    for (const r of rows) {
      if (!byPilot.has(r.ownerVid)) byPilot.set(r.ownerVid, []);
      byPilot.get(r.ownerVid).push(r);
    }
    const result = {};
    for (const [vid, slots] of byPilot) {
      const conflicting = slots.filter((slot) => findConflict(slot, slots) !== null);
      if (conflicting.length) result[vid] = conflicting.map(shapeSlot);
    }
    res.json(result);
  })
);

// Rejects any non-empty airport code that isn't a real IVAO airport (an empty
// origin/destination is allowed - that's an open/private slot). No-ops if the IVAO
// catalogue is unavailable, so we never block on a check we can't perform.
async function assertAirportsExist(...icaos) {
  const bad = await unknownAirportsExcludingCustom(icaos.filter(Boolean));
  if (bad.size) throw new ApiError(422, 'slot.invalidAirport', { airports: [...bad] });
}

/* ─────────────────────────── CREATE (admin) ─────────────────────────── */
router.post(
  '/event/:eventId/slot',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const data = slotSchema.parse(normalizeSlotInput(req.body));
    await assertAirportsExist(data.origin, data.destination);

    const fields = {
      eventId: event.id,
      flightNumber: data.flightNumber ?? null,
      isFixedFlightNumber: data.flightNumber ? 1 : 0,
      origin: data.origin ?? null,
      isFixedOrigin: data.origin ? 1 : 0,
      destination: data.destination ?? null,
      isFixedDestination: data.destination ? 1 : 0,
      aircraft: data.aircraft ?? null,
      isFixedAircraft: data.aircraft ? 1 : 0,
      slotTime: data.slotTime ? data.slotTime.replace('T', ' ').slice(0, 19) : null,
      isFixedSlotTime: data.slotTime ? 1 : 0,
      gate: data.gate ?? null,
      // Private = the route isn't fully specified (origin and/or destination left open).
      isPrivate: data.origin && data.destination ? 0 : 1,
      route: data.route ?? null,
    };
    const result = await query(
      `INSERT INTO slots (eventId, flightNumber, isFixedFlightNumber, origin, isFixedOrigin, destination, isFixedDestination, aircraft, isFixedAircraft, slotTime, isFixedSlotTime, gate, isPrivate, route, bookingStatus)
       VALUES (:eventId,:flightNumber,:isFixedFlightNumber,:origin,:isFixedOrigin,:destination,:isFixedDestination,:aircraft,:isFixedAircraft,:slotTime,:isFixedSlotTime,:gate,:isPrivate,:route,'free')`,
      fields
    );
    await audit(req.user.id, 'create', 'slot', result.insertId, { eventId: event.id });
    const created = await queryOne('SELECT * FROM slots WHERE id=:id', { id: result.insertId });
    res.status(201).json(shapeSlot(created));
  })
);

/* ─────────────────────────── BULK IMPORT (admin) - fixed ─────────────────────────── */
router.post(
  '/event/:eventId/slot/many',
  requireAuth,
  requireAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    if (!req.file) throw new ApiError(422, 'file.required');

    let records;
    try {
      records = parseCsv(req.file.buffer);
    } catch {
      throw new ApiError(422, 'file.invalidCsv');
    }
    if (!Array.isArray(records) || records.length === 0) throw new ApiError(422, 'file.empty');
    if (records.length > 2000) throw new ApiError(422, 'file.tooManyRows');

    // Validate EVERY row up-front and collect all problems, so the admin sees the full
    // list of what to fix rather than one error at a time. Nothing is imported unless
    // the whole file is clean. Empty origin/destination is allowed (an open/private slot).
    const issues = [];
    const valid = [];
    const FIELD_LABEL = { flightNumber: 'flight number', origin: 'origin', destination: 'destination', aircraft: 'aircraft', gate: 'gate', slotTime: 'slot time', route: 'route' };
    for (const [i, raw] of records.entries()) {
      const parsed = slotSchema.safeParse(normalizeSlotInput(raw));
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
          issues.push({ row: i + 1, field, message: `${FIELD_LABEL[field] || field}: ${msgs[0]}` });
        }
        for (const m of flat.formErrors || []) issues.push({ row: i + 1, field: '(row)', message: m });
        continue;
      }
      valid.push({ i, d: parsed.data });
    }

    // Verify that every non-empty airport code is a real IVAO airport (catches typos
    // that still look like valid 4-letter codes, e.g. "EGLX").
    const codes = new Set();
    for (const { d } of valid) {
      if (d.origin) codes.add(d.origin);
      if (d.destination) codes.add(d.destination);
    }
    const bad = await unknownAirportsExcludingCustom([...codes]);
    if (bad.size) {
      for (const { i, d } of valid) {
        if (d.origin && bad.has(d.origin)) issues.push({ row: i + 1, field: 'origin', message: `origin: "${d.origin}" is not a known airport ICAO` });
        if (d.destination && bad.has(d.destination)) issues.push({ row: i + 1, field: 'destination', message: `destination: "${d.destination}" is not a known airport ICAO` });
      }
    }

    if (issues.length) {
      issues.sort((a, b) => a.row - b.row);
      throw new ApiError(422, 'file.rowsInvalid', { issues: issues.slice(0, 200), total: issues.length, rows: records.length });
    }

    const prepared = valid.map(({ d }) => ({
      eventId: event.id,
      flightNumber: d.flightNumber ?? null,
      isFixedFlightNumber: d.flightNumber ? 1 : 0,
      origin: d.origin ?? null,
      isFixedOrigin: d.origin ? 1 : 0,
      destination: d.destination ?? null,
      isFixedDestination: d.destination ? 1 : 0,
      aircraft: d.aircraft ?? null,
      isFixedAircraft: d.aircraft ? 1 : 0,
      slotTime: d.slotTime ? d.slotTime.replace('T', ' ').slice(0, 19) : null,
      isFixedSlotTime: d.slotTime ? 1 : 0,
      gate: d.gate ?? null,
      isPrivate: d.origin && d.destination ? 0 : 1,
    }));

    await transaction(async (tx) => {
      for (const f of prepared) {
        await tx.query(
          `INSERT INTO slots (eventId, flightNumber, isFixedFlightNumber, origin, isFixedOrigin, destination, isFixedDestination, aircraft, isFixedAircraft, slotTime, isFixedSlotTime, gate, isPrivate, bookingStatus)
           VALUES (:eventId,:flightNumber,:isFixedFlightNumber,:origin,:isFixedOrigin,:destination,:isFixedDestination,:aircraft,:isFixedAircraft,:slotTime,:isFixedSlotTime,:gate,:isPrivate,'free')`,
          f
        );
      }
    });
    await audit(req.user.id, 'import', 'slot', event.id, { count: prepared.length });
    res.status(201).json({ imported: prepared.length });
  })
);

/* ─────────────────────────── UPDATE (admin) ─────────────────────────── */
router.put(
  '/slot/:slotId',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const slot = await queryOne('SELECT * FROM slots WHERE id=:id', { id: req.params.slotId });
    if (!slot) throw new ApiError(404, 'slot.notFound');
    const data = slotSchema.parse(normalizeSlotInput(req.body));
    await assertAirportsExist(data.origin, data.destination);

    await query(
      `UPDATE slots SET
        flightNumber=:flightNumber, isFixedFlightNumber=:isFixedFlightNumber,
        origin=:origin, isFixedOrigin=:isFixedOrigin,
        destination=:destination, isFixedDestination=:isFixedDestination,
        aircraft=:aircraft, isFixedAircraft=:isFixedAircraft,
        slotTime=:slotTime, isFixedSlotTime=:isFixedSlotTime,
        gate=:gate, isPrivate=:isPrivate, route=:route
       WHERE id=:id`,
      {
        id: slot.id,
        flightNumber: data.flightNumber ?? null,
        isFixedFlightNumber: data.flightNumber ? 1 : 0,
        origin: data.origin ?? null,
        isFixedOrigin: data.origin ? 1 : 0,
        destination: data.destination ?? null,
        isFixedDestination: data.destination ? 1 : 0,
        aircraft: data.aircraft ?? null,
        isFixedAircraft: data.aircraft ? 1 : 0,
        slotTime: data.slotTime ? data.slotTime.replace('T', ' ').slice(0, 19) : null,
        isFixedSlotTime: data.slotTime ? 1 : 0,
        gate: data.gate ?? null,
        // Private = the route isn't fully specified (origin and/or destination left open).
      isPrivate: data.origin && data.destination ? 0 : 1,
        route: data.route ?? null,
      }
    );
    await audit(req.user.id, 'update', 'slot', slot.id);
    res.json(shapeSlot(await queryOne('SELECT * FROM slots WHERE id=:id', { id: slot.id })));
  })
);

/* ─────────────────────────── DELETE (admin) ─────────────────────────── */
router.delete(
  '/slot/:slotId',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const slot = await queryOne('SELECT id FROM slots WHERE id=:id', { id: req.params.slotId });
    if (!slot) throw new ApiError(404, 'slot.notFound');
    await query('DELETE FROM slots WHERE id=:id', { id: slot.id });
    await audit(req.user.id, 'delete', 'slot', slot.id);
    res.status(204).end();
  })
);

/* ─────────────────────────── BULK (admin) ─────────────────────────── */
router.post(
  '/event/:eventId/slot/bulk',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const { action, ids, minutes } = bulkSlotSchema.parse(req.body);
    if (action === 'shift' && minutes == null) throw new ApiError(422, 'validation.failed');

    // Bind ids as named params and - critically - scope every statement to this event
    // so a crafted request can't touch slots belonging to another event.
    const placeholders = ids.map((_, i) => `:id${i}`).join(',');
    const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
    params.e = event.id;

    let affected = 0;
    await transaction(async (tx) => {
      if (action === 'delete') {
        const r = await tx.query(`DELETE FROM slots WHERE eventId=:e AND id IN (${placeholders})`, params);
        affected = r.affectedRows;
      } else if (action === 'free') {
        const r = await tx.query(
          `UPDATE slots SET pilotId=NULL, bookingStatus='free', bookingTime=NULL,
             flightNumber = IF(isFixedFlightNumber=1, flightNumber, NULL),
             origin       = IF(isFixedOrigin=1, origin, NULL),
             destination  = IF(isFixedDestination=1, destination, NULL),
             aircraft     = IF(isFixedAircraft=1, aircraft, NULL),
             slotTime     = IF(isFixedSlotTime=1, slotTime, NULL),
             route        = NULL
           WHERE eventId=:e AND id IN (${placeholders})`,
          params
        );
        affected = r.affectedRows;
      } else if (action === 'shift') {
        const r = await tx.query(
          `UPDATE slots SET slotTime = DATE_ADD(slotTime, INTERVAL :m MINUTE)
           WHERE eventId=:e AND id IN (${placeholders}) AND slotTime IS NOT NULL`,
          { ...params, m: minutes }
        );
        affected = r.affectedRows;
      }
    });

    await audit(req.user.id, `bulk:${action}`, 'slot', event.id, { requested: ids.length, affected, minutes });
    res.json({ affected });
  })
);

/* ─────────────────────────── BOOK / CANCEL / CONFIRM ─────────────────────────── */
router.patch(
  '/slot/:slotId/:action',
  requireAuth,
  bookingLimiter,
  asyncHandler(async (req, res) => {
    const { action } = req.params;
    if (!['book', 'cancel', 'confirm'].includes(action)) throw new ApiError(404, 'route.notFound');
    const user = req.user;
    if (user.suspended) throw new ApiError(403, 'book.suspended');

    const result = await transaction(async (tx) => {
      // Lock the slot row to prevent concurrent double-booking.
      const slot = await tx.queryOne('SELECT * FROM slots WHERE id=:id FOR UPDATE', { id: req.params.slotId });
      if (!slot) throw new ApiError(404, 'slot.notFound');
      const event = await tx.queryOne('SELECT * FROM events WHERE id=:id', { id: slot.eventId });
      if (!event) throw new ApiError(404, 'event.notFound');

      const state = eventState(event);

      // Ownership guard (mirrors SlotPolicy).
      if (slot.pilotId != null && String(slot.pilotId) !== String(user.id) && !user.isAdmin) {
        throw new ApiError(403, 'book.notOwner');
      }
      if (event.status !== 'scheduled') throw new ApiError(422, 'book.notActive');
      if (state.hasEnded) throw new ApiError(422, 'book.hasEnded');

      if (action === 'book') {
        const isOwner = slot.pilotId != null && String(slot.pilotId) === String(user.id);
        // A prebooked slot past its claim deadline can be taken over by another pilot.
        const claimable = slot.bookingStatus === 'prebooked' && state.pastConfirmDeadline;
        if (slot.bookingStatus !== 'free' && !isOwner && !claimable) {
          throw new ApiError(422, 'book.alreadyTaken');
        }
        if (state.hasStarted && !event.allowBookingAfterStart) throw new ApiError(422, 'book.hasStarted');

        // Per-pilot booking cap (0 = unlimited). Applies whenever the pilot takes a
        // slot they don't already hold (a fresh booking or a claim from someone else).
        if (event.maxBookingsPerPilot > 0 && !isOwner) {
          const count = (
            await tx.query(
              "SELECT COUNT(*) c FROM slots WHERE eventId=:e AND pilotId=:pid AND bookingStatus<>'free'",
              { e: event.id, pid: user.id }
            )
          )[0].c;
          if (count >= event.maxBookingsPerPilot) throw new ApiError(422, 'book.limitReached');
        }

        const data = bookSchema.parse(normalizeSlotInput(req.body || {}));

        // Fixed fields come from the slot; open fields from the pilot.
        const merged = {
          flightNumber: slot.isFixedFlightNumber ? slot.flightNumber : data.flightNumber ?? null,
          origin: slot.isFixedOrigin ? slot.origin : data.origin ?? null,
          destination: slot.isFixedDestination ? slot.destination : data.destination ?? null,
          aircraft: slot.isFixedAircraft ? slot.aircraft : data.aircraft ?? null,
          slotTime: slot.isFixedSlotTime ? slot.slotTime : data.slotTime ? data.slotTime.replace('T', ' ').slice(0, 19) : null,
          gate: slot.gate ?? data.gate ?? null,
          route: data.route ?? slot.route ?? null,
        };

        // Require the open fields to be filled.
        if (!merged.flightNumber) throw new ApiError(422, 'book.flightNumberRequired');
        if (!merged.origin || !merged.destination) throw new ApiError(422, 'book.routeRequired');
        if (!merged.slotTime) throw new ApiError(422, 'book.slotTimeRequired');
        // Pilot-supplied airports must be real (fixed staff-set ones aren't re-checked).
        await assertAirportsExist(
          slot.isFixedOrigin ? null : merged.origin,
          slot.isFixedDestination ? null : merged.destination
        );

        // No duplicate (non-fixed) flight number within the same event.
        const dup = await tx.queryOne(
          `SELECT id FROM slots WHERE eventId=:e AND flightNumber=:fn AND isFixedFlightNumber=0 AND id<>:id LIMIT 1`,
          { e: event.id, fn: merged.flightNumber, id: slot.id }
        );
        if (dup) throw new ApiError(422, 'book.duplicateNumber');

        // Overlap check against the pilot's other booked slots (the real fix).
        const others = await tx.query(
          `SELECT * FROM slots WHERE pilotId=:pid AND id<>:id AND bookingStatus<>'free'`,
          { pid: user.id, id: slot.id }
        );
        const candidate = { ...slot, ...merged, eventId: event.id };
        if (findConflict(candidate, others)) throw new ApiError(422, 'book.overlapping');

        // When the event doesn't require confirmation, the booking is instant.
        // Otherwise it is provisional (prebooked) until the pilot confirms.
        const bookingStatus = state.requireConfirmation ? 'prebooked' : 'booked';
        await tx.query(
          `UPDATE slots SET pilotId=:pid, flightNumber=:flightNumber, origin=:origin, destination=:destination,
             aircraft=:aircraft, slotTime=:slotTime, gate=:gate, route=:route,
             bookingStatus=:status, bookingTime=UTC_TIMESTAMP()
           WHERE id=:id`,
          { pid: user.id, ...merged, status: bookingStatus, id: slot.id }
        );
        return { action, bookingStatus };
      }

      if (action === 'cancel') {
        await tx.query(
          `UPDATE slots SET
             pilotId=NULL, bookingStatus='free', bookingTime=NULL,
             flightNumber = IF(isFixedFlightNumber=1, flightNumber, NULL),
             origin       = IF(isFixedOrigin=1, origin, NULL),
             destination  = IF(isFixedDestination=1, destination, NULL),
             aircraft     = IF(isFixedAircraft=1, aircraft, NULL),
             slotTime     = IF(isFixedSlotTime=1, slotTime, NULL),
             route        = NULL
           WHERE id=:id`,
          { id: slot.id }
        );
        return { action };
      }

      // confirm
      if (slot.bookingStatus !== 'prebooked') throw new ApiError(422, 'book.notPrebooked');
      if (!state.canConfirmSlots) throw new ApiError(422, 'book.tooEarly');
      await tx.query(`UPDATE slots SET bookingStatus='booked' WHERE id=:id`, { id: slot.id });
      return { action };
    });

    await audit(user.id, action, 'slot', req.params.slotId, result);
    const updated = await queryOne('SELECT * FROM slots WHERE id=:id', { id: req.params.slotId });
    res.json(shapeSlot(updated));
  })
);

export default router;
