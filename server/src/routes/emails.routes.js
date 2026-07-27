import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { audit } from '../utils/audit.js';
import { sendBulk, isEmailConfigured } from '../services/mailer.js';
import { composerDefaults, PLACEHOLDERS } from '../services/emailTemplates.js';
import {
  fmtDate,
  eventCtx,
  participantCtx,
  loadParticipants,
  loadUnconfirmed,
  composeFor,
} from '../services/eventEmails.js';

const router = Router();
const adminOnly = [requireAuth, requireAdmin];

// The four email types. Each is admin-sent (never automatic), re-sendable any time,
// and always resolves its recipients + content from CURRENT bookings at send time.
//   template  -> which composerDefaults / layout to use
//   audience  -> who it goes to (NOTAM lets the admin choose, so it's null here)
//   logType   -> event_emails.type value for the history log
const EMAIL_TYPES = {
  reminder: { template: 'reminder', audience: 'participants', logType: 'reminder', subject: (e) => `Reminder: ${e.eventName}` },
  confirmReminder: { template: 'confirmReminder', audience: 'unconfirmed', logType: 'confirm-reminder', subject: (e) => `Confirm reminder: ${e.eventName}` },
  notam: { template: 'notam', audience: null, logType: 'notam', subject: (e) => `NOTAM: ${e.eventName}` },
  cancellation: { template: 'cancelled', audience: 'participants', logType: 'cancelled', subject: (e) => `Cancelled: ${e.eventName}` },
};

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

// Records a sent email (multi-send; no one-time lock) and returns its row id.
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

// Live counts + defaults + history for the Email panel. No one-time flags: every
// email can be sent again and recomputes from current bookings.
router.get(
  '/event/:eventId/email/status',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const participants = await loadParticipants(event.id);
    const unconfirmed = await loadUnconfirmed(event.id);
    const log = await query(
      'SELECT id, type, subject, recipients, sent, failed, createdAt FROM event_emails WHERE eventId=:e ORDER BY createdAt DESC',
      { e: event.id }
    );
    res.json({
      configured: isEmailConfigured(),
      participantCount: participants.length,
      unconfirmedCount: unconfirmed.length,
      requireConfirmation: Boolean(Number(event.requireConfirmation)),
      placeholders: PLACEHOLDERS,
      defaults: {
        reminder: composerDefaults.reminder,
        confirmReminder: composerDefaults.confirmReminder,
        notam: composerDefaults.notam,
        cancellation: composerDefaults.cancelled,
      },
      log,
    });
  })
);

// Live HTML preview for any type (uses a sample/real pilot's flight).
router.post(
  '/event/:eventId/email/preview',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const cfg = EMAIL_TYPES[req.body?.type] || EMAIL_TYPES.notam;
    const opts = { ...composerDefaults[cfg.template], ...(req.body || {}) };
    const ctx = await sampleCtxFor(event);
    res.json({ html: composeFor(cfg.template, opts, ctx, event).html });
  })
);

// Send one email of any type NOW, to its current audience. Admin-triggered only;
// re-sendable; recipients + content are computed fresh from live bookings.
router.post(
  '/event/:eventId/email/send',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const cfg = EMAIL_TYPES[req.body?.type];
    if (!cfg) throw new ApiError(422, 'email.invalidType');

    const audience =
      cfg.audience ||
      (['participants', 'booked', 'unconfirmed'].includes(req.body?.audience) ? req.body.audience : 'participants');
    const vid = cfg.audience ? undefined : req.body?.vid; // only NOTAM narrows to a single VID
    const recipients = await loadAudience(event.id, audience, vid);
    if (!recipients.length) throw new ApiError(422, 'email.noRecipients');

    const opts = { ...composerDefaults[cfg.template], ...(req.body || {}) };
    const messages = recipients.map((p) => {
      const { subject, html, text } = composeFor(cfg.template, opts, participantCtx(event, p), event);
      return { to: p.email, subject, html, text };
    });
    const result = await sendBulk(messages);
    const emailId = await recordSend(event.id, cfg.logType, opts.subject || cfg.subject(event), req.user.id, result);
    await recordRecipients(emailId, recipients, result);
    await audit(req.user.id, `email:${cfg.logType}`, 'event', event.id, { sent: result.sent, failed: result.failed, audience });
    res.json(result);
  })
);

// Send a single test copy of any type to the requesting admin's own address.
router.post(
  '/event/:eventId/email/test',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const event = await getEventOr404(req.params.eventId);
    const to = req.user.email;
    if (!to) throw new ApiError(422, 'email.noSelfEmail');
    const cfg = EMAIL_TYPES[req.body?.type] || EMAIL_TYPES.notam;
    const opts = { ...composerDefaults[cfg.template], ...(req.body || {}) };
    const ctx = await sampleCtxFor(event);
    const { subject, html, text } = composeFor(cfg.template, opts, ctx, event);
    const result = await sendBulk([{ to, subject: `[TEST] ${subject}`, html, text }]);
    await audit(req.user.id, 'email:test', 'event', event.id, { type: req.body?.type, to });
    res.json({ ...result, to });
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

export default router;
