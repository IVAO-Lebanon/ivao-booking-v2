// Background job: emails pilots who still have an unconfirmed (prebooked) slot,
// reminding them to confirm. Each event fires ONCE, at the admin-configured time
// (an absolute UTC time, or N hours before the event start). Idempotent and
// race-safe via the UNIQUE (eventId, type, onceKey) index on event_emails.
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { sendBulk } from './mailer.js';
import { buildBody, buildText, preheaderFrom, layout, render, composerDefaults } from './emailTemplates.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function toUtc(mysql) {
  if (!mysql) return null;
  const s = String(mysql).replace(' ', 'T');
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}
const fmtDate = (v) => { const d = toUtc(v); return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; };
const fmtTime = (v) => { const d = toUtc(v); return d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}z` : ''; };
const fmtDateTime = (v) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : '');

function clientBase() {
  return (config.clientOrigins && config.clientOrigins[0]) || 'http://localhost:5173';
}

function participantCtx(event, p) {
  return {
    eventName: event.eventName,
    eventDate: fmtDate(event.dateStart),
    eventTime: `${fmtTime(event.dateStart)}–${fmtTime(event.dateEnd)}`,
    division: config.division,
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

// Records that the reminder for this event has been sent. The UNIQUE
// (eventId, type, onceKey) index makes this the single source of truth for
// "already done" - written only AFTER the emails go out, so a crash mid-send
// leaves no row and the next boot retries (at-least-once; a crash can at worst
// re-notify, never silently skip). Returns false if a row already existed.
async function recordDone(event, result) {
  try {
    const res = await query(
      `INSERT INTO event_emails (eventId, type, onceKey, subject, sentBy, recipients, sent, failed)
       VALUES (:e, 'confirm-reminder', 'auto', :s, NULL, :r, :sent, :f)`,
      { e: event.id, s: `Confirm reminder: ${event.eventName}`.slice(0, 250), r: result.total, sent: result.sent, f: result.failed }
    );
    return res.insertId; // truthy row id
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || /Duplicate/i.test(err.message || '')) return null;
    throw err;
  }
}

// Per-recipient delivery log (mirrors the manual email routes).
async function recordRecipients(emailId, recipients, result) {
  const rows = result?.results || [];
  if (!emailId || !rows.length) return;
  const byEmail = new Map(recipients.map((p) => [p.email, p]));
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
  await query(`INSERT INTO event_email_recipients (emailId, vid, name, email, ok, error) VALUES ${tuples.join(',')}`, params);
}

async function sendForEvent(event) {
  const rows = await query(
    `SELECT u.id, u.vid, u.firstName, u.lastName, u.email,
            s.flightNumber, s.origin, s.destination, s.slotTime, s.aircraft, s.gate
       FROM slots s JOIN users u ON u.id = s.pilotId
      WHERE s.eventId = :e AND s.bookingStatus = 'prebooked' AND u.email IS NOT NULL AND u.email <> ''
      ORDER BY s.slotTime ASC`,
    { e: event.id }
  );
  const byPilot = new Map();
  for (const r of rows) if (!byPilot.has(r.id)) byPilot.set(r.id, r);
  const recipients = [...byPilot.values()];

  // Nobody left to remind (all confirmed / cancelled): mark done so we stop checking.
  if (recipients.length === 0) {
    await recordDone(event, { total: 0, sent: 0, failed: 0 });
    return;
  }

  const url = `${clientBase()}/events/${event.id}`;
  const messages = recipients.map((p) => {
    const ctx = participantCtx(event, p);
    const opts = { ...composerDefaults.confirmReminder, ctaUrl: url };
    const subject = render(opts.subject, ctx);
    const html = layout({
      subject,
      division: config.division,
      bodyHtml: render(buildBody(opts), ctx),
      preheader: render(preheaderFrom(opts, ctx), ctx),
      headerTag: render(opts.headerTag, ctx),
      footerNote: '',
    });
    const text = buildText(opts, ctx);
    return { to: p.email, subject, html, text };
  });

  const result = await sendBulk(messages);
  const emailId = await recordDone(event, result);
  if (emailId) {
    await recordRecipients(emailId, recipients, result);
    // eslint-disable-next-line no-console
    console.log(`📧 Sent ${result.sent}/${result.total} confirm reminder(s) for "${event.eventName}".`);
  }
}

// Guards against overlapping ticks in the same process (a slow send taking longer
// than the 60s interval would otherwise double-fire before recordDone runs).
let running = false;

/** Finds events whose confirm-reminder is now due and sends it (once). */
export async function sendDueConfirmReminders() {
  if (running) return;
  running = true;
  try {
    const due = await query(
      `SELECT * FROM events e
        WHERE e.status = 'scheduled'
          AND e.requireConfirmation = 1
          AND e.dateStart > UTC_TIMESTAMP()
          AND (e.confirmReminderAt IS NOT NULL OR e.confirmReminderHoursBefore > 0)
          AND COALESCE(e.confirmReminderAt, DATE_SUB(e.dateStart, INTERVAL e.confirmReminderHoursBefore HOUR)) <= UTC_TIMESTAMP()
          AND NOT EXISTS (
            SELECT 1 FROM event_emails ee
             WHERE ee.eventId = e.id AND ee.type = 'confirm-reminder' AND ee.onceKey = 'auto'
          )`
    );
    for (const event of due) {
      await sendForEvent(event);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('confirm-reminder job failed:', err.message);
  } finally {
    running = false;
  }
}
