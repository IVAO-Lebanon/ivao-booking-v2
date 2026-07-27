import { Router } from 'express';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { audit } from '../utils/audit.js';
import { toCsv } from '../utils/csv.js';
import { sendBulk, isEmailConfigured } from '../services/mailer.js';
import { composerDefaults, PLACEHOLDERS } from '../services/emailTemplates.js';
import {
  fmtDate,
  fmtDateTime,
  eventCtx,
  participantCtx,
  loadParticipants,
  loadUnconfirmed,
  composeFor,
} from '../services/eventEmails.js';

const router = Router();

async function getEventOr404(id) {
  const e = await queryOne('SELECT * FROM events WHERE id=:id', { id });
  if (!e) throw new ApiError(404, 'event.notFound');
  return e;
}

// Pilots whose booking is CONFIRMED (booked) with an email.
async function loadBooked(eventId) {
  const rows = await query(
    `SELECT u.id, u.vid, u.firstName, u.lastName, u.email,
            s.flightNumber, s.origin, s.destination, s.slotTime, s.aircraft, s.gate
       FROM slots s JOIN users u ON u.id = s.pilotId
      WHERE s.eventId = :e AND s.bookingStatus = 'booked' AND u.email IS NOT NULL AND u.email <> ''
      ORDER BY s.slotTime ASC`,
    { e: eventId }
  );
  const byPilot = new Map();
  for (const r of rows) if (!byPilot.has(r.id)) byPilot.set(r.id, r);
  return [...byPilot.values()];
}

// Resolve a recipient list from an audience choice (+ optional single-VID filter).
async function loadAudience(eventId, audience, vid) {
  let list;
  if (audience === 'booked') list = await loadBooked(eventId);
  else if (audience === 'unconfirmed') list = await loadUnconfirmed(eventId);
  else list = await loadParticipants(eventId); // 'participants' (all non-free) or default
  if (vid) list = list.filter((p) => String(p.vid) === String(vid).trim());
  return list;
}

// A realistic ctx for previews / test sends: the first participant's flight, or a
// sample when the event has no bookings yet.
async function sampleCtxFor(event) {
  const p = (await loadParticipants(event.id))[0];
  return p
    ? participantCtx(event, p)
    : { ...eventCtx(event), pilotName: 'Sample Pilot', vid: '000000', callsign: 'ABC123', origin: 'EGLL', destination: 'LFPG', slotTime: `${fmtDate(event.dateStart)} 16:00z`, aircraft: 'A320', gate: 'A1' };
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
// Records an unlimited (multi-send) email of a given type and returns its row id.
async function recordSend(eventId, type, subject, userId, r) {
  const res = await query(
    `INSERT INTO event_emails (eventId, type, onceKey, subject, sentBy, recipients, sent, failed)
     VALUES (:e,:t,:k,:s,:by,:r,:sent,:f)`,
    { e: eventId, t: type, k: `${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`.slice(0, 40), s: String(subject).slice(0, 250), by: userId, r: r.total, sent: r.sent, f: r.failed }
  );
  return res.insertId;
}

// Persists the per-recipient delivery result (who + ok/failed) for a sent email.
async function recordRecipients(emailId, participants, result) {
  const rows = result?.results || [];
  if (!emailId || !rows.length) return;
  const byEmail = new Map(participants.map((p) => [p.email, p]));
  const tuples = [];
  const params = { id: emailId };
  rows.forEach((r, i) => {
    const p = byEmail.get(r.to);
    tuples.push(`(:id, :v${i}, :n${i}, :e${i}, :ok${i}, :err${i})`);
    params[`v${i}`] = p?.vid || '';
    params[`n${i}`] = p ? `${p.firstName} ${p.lastName}`.trim() : '';
    params[`e${i}`] = String(r.to || '').slice(0, 255);
    params[`ok${i}`] = r.ok ? 1 : 0;
    params[`err${i}`] = r.ok ? null : String(r.error || '').slice(0, 255);
  });
  await query(
    `INSERT INTO event_email_recipients (emailId, vid, name, email, ok, error) VALUES ${tuples.join(',')}`,
    params
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
    const unconfirmed = await loadUnconfirmed(event.id);
    const allPilots = (await query("SELECT COUNT(*) c FROM users WHERE email IS NOT NULL AND email <> ''"))[0].c;
    const log = await query(
      'SELECT id, type, subject, recipients, sent, failed, createdAt FROM event_emails WHERE eventId=:e ORDER BY createdAt DESC',
      { e: event.id }
    );
    res.json({
      configured: isEmailConfigured(),
      eventsDept: config.email.eventsDept || '',
      reminderSent: await alreadySent(event.id, 'reminder'),
      reportSent: await alreadySent(event.id, 'report'),
      participantCount: participants.length,
      unconfirmedCount: unconfirmed.length,
      requireConfirmation: Boolean(Number(event.requireConfirmation)),
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
    const ctx = await sampleCtxFor(event);
    res.json({ html: composeFor(type, opts, ctx, event).html });
  })
);

router.post(
  '/event/:eventId/email/reminder',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    // Reminders go to pilots who actually booked - personalised with their flight.
    const participants = await loadParticipants(event.id);
    if (!participants.length) throw new ApiError(422, 'email.noRecipients');
    const opts = { ...composerDefaults.reminder, ...(req.body || {}) };

    const claimId = await claimOnce(event.id, 'reminder', opts.subject || `Reminder: ${event.eventName}`, req.user.id);
    try {
      const messages = participants.map((p) => {
        const { subject, html, text } = composeFor('reminder', opts, participantCtx(event, p), event);
        return { to: p.email, subject, html, text };
      });
      const result = await sendBulk(messages);
      if (result.total > 0 && result.sent === 0) { await releaseOnce(claimId); throw new ApiError(502, 'email.sendFailed'); }
      await finalize(claimId, result);
      await recordRecipients(claimId, participants, result);
      await audit(req.user.id, 'email:reminder', 'event', event.id, { sent: result.sent, failed: result.failed });
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
    // Audience is admin-selectable: all participants (default), only confirmed, only
    // unconfirmed, and optionally a single VID.
    const audience = ['participants', 'booked', 'unconfirmed'].includes(req.body?.audience) ? req.body.audience : 'participants';
    const recipients = await loadAudience(event.id, audience, req.body?.vid);
    if (!recipients.length) throw new ApiError(422, 'email.noRecipients');
    const opts = { ...composerDefaults.notam, ...(req.body || {}) };

    const messages = recipients.map((p) => {
      const { subject, html, text } = composeFor('notam', opts, participantCtx(event, p), event);
      return { to: p.email, subject, html, text };
    });
    const result = await sendBulk(messages);
    const emailId = await recordSend(event.id, 'notam', opts.subject || `NOTAM: ${event.eventName}`, req.user.id, result);
    await recordRecipients(emailId, recipients, result);
    await audit(req.user.id, 'email:notam', 'event', event.id, { sent: result.sent, failed: result.failed, audience });
    res.json(result);
  })
);

// Send a single test email of any type to the requesting admin's own address, so they
// can see exactly what pilots will receive. Not recorded in the log.
router.post(
  '/event/:eventId/email/test',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const to = req.user.email;
    if (!to) throw new ApiError(422, 'email.noSelfEmail');
    const type = ['reminder', 'notam', 'confirmReminder'].includes(req.body?.type) ? req.body.type : 'notam';
    const opts = { ...(composerDefaults[type] || composerDefaults.notam), ...(req.body || {}) };
    // Use a real participant's data for a realistic preview when available.
    const ctx = await sampleCtxFor(event);
    const { subject, html, text } = composeFor(type, opts, ctx, event);
    const result = await sendBulk([{ to, subject: `[TEST] ${subject}`, html, text }]);
    await audit(req.user.id, 'email:test', 'event', event.id, { type, to });
    res.json({ ...result, to });
  })
);

// Manual confirm-booking reminder to pilots who have NOT confirmed yet (unlimited).
router.post(
  '/event/:eventId/email/confirm-reminder',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const recipients = await loadUnconfirmed(event.id);
    if (!recipients.length) throw new ApiError(422, 'email.noRecipients');
    const opts = { ...composerDefaults.confirmReminder, ...(req.body || {}) };

    const messages = recipients.map((p) => {
      const { subject, html, text } = composeFor('confirmReminder', opts, participantCtx(event, p), event);
      return { to: p.email, subject, html, text };
    });
    const result = await sendBulk(messages);
    const emailId = await recordSend(event.id, 'confirm-reminder', opts.subject || `Confirm reminder: ${event.eventName}`, req.user.id, result);
    await recordRecipients(emailId, recipients, result);
    await audit(req.user.id, 'email:confirm-reminder', 'event', event.id, { sent: result.sent, failed: result.failed });
    res.json(result);
  })
);

// Per-recipient delivery detail for one sent email (scoped to the event).
router.get(
  '/event/:eventId/email/:emailId/recipients',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    // Note: email addresses are intentionally NOT returned - only name + VID.
    const rows = await query(
      `SELECT r.vid, r.name, r.ok, r.error, r.createdAt
         FROM event_email_recipients r JOIN event_emails e ON e.id = r.emailId
        WHERE r.emailId = :id AND e.eventId = :e
        ORDER BY r.ok ASC, r.name ASC`,
      { id: req.params.emailId, e: event.id }
    );
    res.json(rows.map((r) => ({ ...r, ok: Boolean(r.ok) })));
  })
);

// ── Email approval queue ─────────────────────────────────────────────────────
// Emails the SYSTEM wants to send (scheduled confirm reminders, cancellation
// notices) are queued as pending approvals. NOTHING is emailed until an admin
// approves an item here, so no email ever leaves without an explicit click.

const APPROVAL_SUBJECT = {
  'confirm-reminder': (e) => `Confirm reminder: ${e.eventName}`,
  cancelled: (e) => `Cancelled: ${e.eventName}`,
};

// Pending approvals (optionally for one event), newest event context joined in.
router.get(
  '/email-approval',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const eventId = req.query.eventId ? Number(req.query.eventId) : null;
    const rows = await query(
      `SELECT a.id, a.eventId, a.type, a.audienceCount, a.createdAt, e.eventName, e.dateStart
         FROM email_approvals a JOIN events e ON e.id = a.eventId
        WHERE a.status = 'pending' ${eventId ? 'AND a.eventId = :eventId' : ''}
        ORDER BY a.createdAt ASC`,
      eventId ? { eventId } : {}
    );
    res.json(rows);
  })
);

// Approve a pending email: send it now (to the current audience) and log it.
router.post(
  '/email-approval/:id/approve',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const ap = await queryOne("SELECT * FROM email_approvals WHERE id=:id AND status='pending'", { id: req.params.id });
    if (!ap) throw new ApiError(404, 'approval.notFound');
    const event = await getEventOr404(ap.eventId);

    const isCancel = ap.type === 'cancelled';
    const recipients = isCancel ? await loadParticipants(event.id) : await loadUnconfirmed(event.id);
    const defaults = isCancel ? composerDefaults.cancelled : composerDefaults.confirmReminder;
    const composerType = isCancel ? 'cancelled' : 'confirmReminder';

    const messages = recipients.map((p) => {
      const { subject, html, text } = composeFor(composerType, defaults, participantCtx(event, p), event);
      return { to: p.email, subject, html, text };
    });
    const result = await sendBulk(messages);

    if (result.total > 0) {
      const emailId = await recordSend(event.id, ap.type, APPROVAL_SUBJECT[ap.type](event), req.user.id, result);
      await recordRecipients(emailId, recipients, result);
    }
    await query("UPDATE email_approvals SET status='sent', decidedAt=UTC_TIMESTAMP(), decidedBy=:by WHERE id=:id", {
      by: req.user.id,
      id: ap.id,
    });
    await audit(req.user.id, `approve:${ap.type}`, 'event', event.id, { sent: result.sent, failed: result.failed });
    res.json(result);
  })
);

// Dismiss a pending email without sending it.
router.post(
  '/email-approval/:id/dismiss',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const ap = await queryOne("SELECT id, eventId, type FROM email_approvals WHERE id=:id AND status='pending'", { id: req.params.id });
    if (!ap) throw new ApiError(404, 'approval.notFound');
    await query("UPDATE email_approvals SET status='dismissed', decidedAt=UTC_TIMESTAMP(), decidedBy=:by WHERE id=:id", {
      by: req.user.id,
      id: ap.id,
    });
    await audit(req.user.id, `dismiss:${ap.type}`, 'event', ap.eventId, null);
    res.json({ ok: true });
  })
);

export default router;
