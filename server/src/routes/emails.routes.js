import { Router } from 'express';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { audit } from '../utils/audit.js';
import { toCsv } from '../utils/csv.js';
import { sendBulk, isEmailConfigured } from '../services/mailer.js';
import {
  layout,
  render,
  reportBody,
  buildBody,
  messageToHtml,
  composerDefaults,
  PLACEHOLDERS,
} from '../services/emailTemplates.js';

const router = Router();
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toUtc(mysql) {
  if (!mysql) return null;
  const s = String(mysql).replace(' ', 'T');
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}
const fmtDate = (v) => { const d = toUtc(v); return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; };
const fmtTime = (v) => { const d = toUtc(v); return d ? `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}z` : ''; };
const fmtDateTime = (v) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : '');

async function getEventOr404(id) {
  const e = await queryOne('SELECT * FROM events WHERE id=:id', { id });
  if (!e) throw new ApiError(404, 'event.notFound');
  return e;
}

function eventCtx(event) {
  return {
    eventName: event.eventName,
    eventDate: fmtDate(event.dateStart),
    eventTime: `${fmtTime(event.dateStart)}–${fmtTime(event.dateEnd)}`,
    division: config.division,
  };
}

async function loadParticipants(eventId) {
  const rows = await query(
    `SELECT u.id, u.vid, u.firstName, u.lastName, u.email,
            s.flightNumber, s.origin, s.destination, s.slotTime, s.aircraft, s.gate
       FROM slots s JOIN users u ON u.id = s.pilotId
      WHERE s.eventId = :e AND s.bookingStatus <> 'free' AND u.email IS NOT NULL AND u.email <> ''
      ORDER BY s.slotTime ASC`,
    { e: eventId }
  );
  const byPilot = new Map();
  for (const r of rows) if (!byPilot.has(r.id)) byPilot.set(r.id, r);
  return [...byPilot.values()];
}

function participantCtx(event, p) {
  return {
    ...eventCtx(event),
    pilotName: `${p.firstName} ${p.lastName}`.trim() || p.vid,
    vid: p.vid,
    callsign: p.flightNumber || '',
    origin: p.origin || '',
    destination: p.destination || '',
    slotTime: fmtDateTime(p.slotTime),
    aircraft: p.aircraft || '',
    gate: p.gate || '',
  };
}

async function loadBookings(eventId) {
  const rows = await query(
    `SELECT s.flightNumber, s.origin, s.destination, s.slotTime, s.aircraft, s.bookingStatus, u.vid
       FROM slots s LEFT JOIN users u ON u.id = s.pilotId
      WHERE s.eventId=:e AND s.bookingStatus <> 'free' ORDER BY s.slotTime ASC`,
    { e: eventId }
  );
  return rows.map((r) => ({
    flightNumber: r.flightNumber,
    origin: r.origin,
    destination: r.destination,
    slotTime: fmtDateTime(r.slotTime),
    aircraft: r.aircraft,
    status: r.bookingStatus,
    pilot: r.vid || '',
  }));
}

function bookingsCsv(bookings) {
  return toCsv(
    ['callsign', 'origin', 'destination', 'slotTime', 'aircraft', 'status', 'pilotVid'],
    bookings.map((b) => ({
      callsign: b.flightNumber || '',
      origin: b.origin || '',
      destination: b.destination || '',
      slotTime: b.slotTime || '',
      aircraft: b.aircraft || '',
      status: b.status,
      pilotVid: b.pilot || '',
    }))
  );
}

// Compose one email from the fully-editable composer fields, resolving placeholders against ctx.
function composeFor(type, opts, ctx, event, bookings = []) {
  const subject = render(String(opts.subject || '').slice(0, 250), ctx);
  const headerTag = render(opts.headerTag || '', ctx);
  const footerNote = render(opts.footerNote || '', ctx);
  if (type === 'report') {
    const intro = render(messageToHtml(opts.message || ''), ctx);
    const inner = reportBody({ event: { ...event, dateLabel: `${fmtDate(event.dateStart)} · ${eventCtx(event).eventTime}` }, bookings }, intro);
    return { subject, html: layout({ subject, division: config.division, bodyHtml: inner, headerTag, footerNote }) };
  }
  const body = buildBody(opts);
  return { subject, html: layout({ subject, division: config.division, bodyHtml: render(body, ctx), headerTag, footerNote }) };
}

// ── One-time guard (atomic via the UNIQUE (eventId,type,onceKey) index) ──
async function claimOnce(eventId, type, subject, userId) {
  try {
    const r = await query(
      `INSERT INTO event_emails (eventId, type, onceKey, subject, sentBy) VALUES (:e,:t,'once',:s,:by)`,
      { e: eventId, t: type, s: String(subject).slice(0, 250), by: userId }
    );
    return r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || /Duplicate/i.test(err.message || '')) throw new ApiError(409, 'email.alreadySent');
    throw err;
  }
}
const finalize = (id, r) => query('UPDATE event_emails SET recipients=:r, sent=:s, failed=:f WHERE id=:id', { id, r: r.total, s: r.sent, f: r.failed });
const releaseOnce = (id) => query('DELETE FROM event_emails WHERE id=:id', { id });
async function recordNotam(eventId, subject, userId, r) {
  await query(
    `INSERT INTO event_emails (eventId, type, onceKey, subject, sentBy, recipients, sent, failed)
     VALUES (:e,'notam',:k,:s,:by,:r,:sent,:f)`,
    { e: eventId, k: `n-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, s: String(subject).slice(0, 250), by: userId, r: r.total, sent: r.sent, f: r.failed }
  );
}
const alreadySent = async (eventId, type) =>
  Boolean(await queryOne("SELECT id FROM event_emails WHERE eventId=:e AND type=:t AND onceKey='once' LIMIT 1", { e: eventId, t: type }));

const adminOnly = [requireAuth, requireAdmin];

router.get(
  '/event/:eventId/email/status',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const participants = await loadParticipants(event.id);
    const allPilots = (await query("SELECT COUNT(*) c FROM users WHERE email IS NOT NULL AND email <> ''"))[0].c;
    const log = await query(
      'SELECT type, subject, recipients, sent, failed, createdAt FROM event_emails WHERE eventId=:e ORDER BY createdAt DESC',
      { e: event.id }
    );
    res.json({
      configured: isEmailConfigured(),
      eventsDept: config.email.eventsDept || '',
      reminderSent: await alreadySent(event.id, 'reminder'),
      reportSent: await alreadySent(event.id, 'report'),
      participantCount: participants.length,
      allPilotsCount: allPilots,
      placeholders: PLACEHOLDERS,
      defaults: composerDefaults,
      log,
    });
  })
);

router.post(
  '/event/:eventId/email/preview',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const type = req.body?.type || 'notam';
    const opts = { ...(composerDefaults[type] || {}), ...(req.body || {}) };
    if (type === 'report') {
      const bookings = await loadBookings(event.id);
      res.json({ html: composeFor('report', opts, eventCtx(event), event, bookings).html });
      return;
    }
    const sample = (await loadParticipants(event.id))[0];
    const ctx = sample
      ? participantCtx(event, sample)
      : { ...eventCtx(event), pilotName: 'Sample Pilot', vid: '000000', callsign: 'ABC123', origin: 'EGLL', destination: 'LFPG', slotTime: `${fmtDate(event.dateStart)} 16:00z`, aircraft: 'A320', gate: 'A1' };
    res.json({ html: composeFor(type, opts, ctx, event).html });
  })
);

router.post(
  '/event/:eventId/email/reminder',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    // Reminders go to pilots who actually booked — personalised with their flight.
    const participants = await loadParticipants(event.id);
    if (!participants.length) throw new ApiError(422, 'email.noRecipients');
    const opts = { ...composerDefaults.reminder, ...(req.body || {}) };

    const claimId = await claimOnce(event.id, 'reminder', opts.subject || `Reminder: ${event.eventName}`, req.user.id);
    try {
      const messages = participants.map((p) => {
        const { subject, html } = composeFor('reminder', opts, participantCtx(event, p), event);
        return { to: p.email, subject, html };
      });
      const result = await sendBulk(messages);
      if (result.total > 0 && result.sent === 0) { await releaseOnce(claimId); throw new ApiError(502, 'email.sendFailed'); }
      await finalize(claimId, result);
      await audit(req.user.id, 'email:reminder', 'event', event.id, { sent: result.sent, failed: result.failed });
      res.json(result);
    } catch (err) {
      if (!(err instanceof ApiError)) await releaseOnce(claimId).catch(() => {});
      throw err;
    }
  })
);

router.post(
  '/event/:eventId/email/report',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const opts = { ...composerDefaults.report, ...(req.body || {}) };
    const to = (opts.to || config.email.eventsDept || '').trim();
    if (!to) throw new ApiError(422, 'email.noEventsDept');

    const claimId = await claimOnce(event.id, 'report', opts.subject || `Bookings report for ${event.eventName}`, req.user.id);
    try {
      const bookings = await loadBookings(event.id);
      const { subject, html } = composeFor('report', opts, eventCtx(event), event, bookings);
      const csv = bookingsCsv(bookings);
      const result = await sendBulk([
        { to, subject, html, attachments: [{ filename: `bookings_${event.eventName.replace(/[^\w]+/g, '_')}.csv`, content: csv, contentType: 'text/csv' }] },
      ]);
      if (result.sent === 0) { await releaseOnce(claimId); throw new ApiError(502, 'email.sendFailed'); }
      await finalize(claimId, result);
      await audit(req.user.id, 'email:report', 'event', event.id, { to, sent: result.sent });
      res.json(result);
    } catch (err) {
      if (!(err instanceof ApiError)) await releaseOnce(claimId).catch(() => {});
      throw err;
    }
  })
);

router.post(
  '/event/:eventId/email/notam',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const participants = await loadParticipants(event.id);
    if (!participants.length) throw new ApiError(422, 'email.noRecipients');
    const opts = { ...composerDefaults.notam, ...(req.body || {}) };

    const messages = participants.map((p) => {
      const { subject, html } = composeFor('notam', opts, participantCtx(event, p), event);
      return { to: p.email, subject, html };
    });
    const result = await sendBulk(messages);
    await recordNotam(event.id, opts.subject || `NOTAM: ${event.eventName}`, req.user.id, result);
    await audit(req.user.id, 'email:notam', 'event', event.id, { sent: result.sent, failed: result.failed });
    res.json(result);
  })
);

export default router;
