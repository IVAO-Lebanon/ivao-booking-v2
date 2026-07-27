// Shared event-email helpers used by both the admin email routes and the
// automatic emails sent during event edits (e.g. cancellation notices). Keeping
// the participant loading + compose logic here means both paths build identical,
// branded emails from the same source.
import { config } from '../config.js';
import { query } from '../db/pool.js';
import {
  layout,
  render,
  reportBody,
  buildBody,
  buildText,
  preheaderFrom,
  messageToHtml,
} from './emailTemplates.js';

/** Public URL of the event page (used to auto-fill CTA buttons). */
export function eventUrl(event) {
  const base = (config.clientOrigins && config.clientOrigins[0]) || 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/events/${event.id}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toUtc(mysql) {
  if (!mysql) return null;
  const s = String(mysql).replace(' ', 'T');
  return new Date(/Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}
export const fmtDate = (v) => {
  const d = toUtc(v);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
};
export const fmtTime = (v) => {
  const d = toUtc(v);
  return d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}z` : '';
};
export const fmtDateTime = (v) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : '');

export function eventCtx(event) {
  return {
    eventName: event.eventName,
    eventDate: fmtDate(event.dateStart),
    eventTime: `${fmtTime(event.dateStart)}-${fmtTime(event.dateEnd)}`,
    division: config.division,
  };
}

export function participantCtx(event, p) {
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

/** All pilots with a booking (non-free) and a usable email, deduped by pilot. */
export async function loadParticipants(eventId) {
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

// Compose one email from the fully-editable composer fields, resolving placeholders against ctx.
export function composeFor(type, opts, ctx, event, bookings = []) {
  const subject = render(String(opts.subject || '').slice(0, 250), ctx);
  const headerTag = render(opts.headerTag || '', ctx);
  const footerNote = render(opts.footerNote || '', ctx);
  if (type === 'report') {
    const intro = render(messageToHtml(opts.message || ''), ctx);
    const inner = reportBody({ event: { ...event, dateLabel: `${fmtDate(event.dateStart)} · ${eventCtx(event).eventTime}` }, bookings }, intro);
    return { subject, html: layout({ subject, division: config.division, bodyHtml: inner, headerTag, footerNote }) };
  }
  // Auto-fill the CTA link with the event page when the admin left it blank, so the
  // button always goes somewhere real.
  const withCta = { ...opts, ctaUrl: opts.ctaShow && !opts.ctaUrl ? eventUrl(event) : opts.ctaUrl };
  const preheader = render(preheaderFrom(withCta, ctx), ctx);
  const html = layout({
    subject,
    division: config.division,
    bodyHtml: render(buildBody(withCta), ctx),
    preheader,
    headerTag,
    footerNote,
  });
  const text = buildText(withCta, ctx);
  return { subject, html, text };
}
