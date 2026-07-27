// Email templates. Table-based, inline-CSS HTML so it renders across mail clients,
// with a matching plain-text alternative for deliverability. `render` swaps
// {{placeholders}} for values.

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Replace {{key}} tokens with (HTML-escaped) values from ctx. */
export function render(template, ctx = {}) {
  return String(template || '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => escapeHtml(ctx[k] ?? ''));
}

/** Like render() but for plain text — no HTML escaping. */
export function renderText(template, ctx = {}) {
  return String(template || '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => String(ctx[k] ?? ''));
}

export const PLACEHOLDERS = [
  { key: 'pilotName', label: "Pilot's name" },
  { key: 'vid', label: 'Pilot VID' },
  { key: 'eventName', label: 'Event name' },
  { key: 'eventDate', label: 'Event date' },
  { key: 'eventTime', label: 'Event time (UTC)' },
  { key: 'callsign', label: 'Flight callsign' },
  { key: 'origin', label: 'Origin ICAO' },
  { key: 'destination', label: 'Destination ICAO' },
  { key: 'slotTime', label: 'Slot time (UTC)' },
  { key: 'aircraft', label: 'Aircraft' },
  { key: 'gate', label: 'Gate' },
  { key: 'division', label: 'Division' },
];

// Colours mirror the website's Tailwind tokens (client/tailwind.config.js):
// atmos (primary blue) + fuselage (blue-tinted neutrals).
const BRAND = '#0D2C99';   // atmos-700 (DEFAULT)
const BRAND_MID = '#1037BF'; // atmos-600
const BRAND_LT = '#1342E4';  // atmos-500
const BRAND_DK = '#091D65';  // atmos-800
const INK = '#191a23';   // fuselage-900 (headings)
const BODY = '#3d3f54';  // fuselage-600 (body text)
const MUTED = '#606282'; // fuselage-500
const LINE = '#e0e1ec';  // fuselage-150
const CARD_BG = '#f4f5fb'; // subtle fuselage tint
const FOOT_BG = '#f7f8fb';
// Fonts mirror the site: Poppins (headings), Nunito Sans (body), IBM Plex Mono.
const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
const SANS = "'Nunito Sans',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
const HEAD = "'Poppins',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Footer credit — matches the website footer + branding.ts AUTHOR.
const AUTHOR = { name: 'Ahmad Dayeh', url: 'https://www.ivao.aero/Member.aspx?Id=588679' };
// Product/brand name + tagline — mirror the website (client/src/lib/branding.ts).
const APP_NAME = 'BYBLOS';
const APP_TAGLINE = 'Flight Booking System';
const APP_OPERATOR = 'IVAO Lebanon';

// ── Reusable HTML building blocks (all inline-styled) ────────────────────────
export const eyebrow = (t) =>
  `<div style="font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${BRAND_LT};margin:0 0 8px;">${escapeHtml(t)}</div>`;

export const heading = (t) =>
  `<h1 style="margin:0 0 16px;font-family:${HEAD};font-size:25px;line-height:1.22;font-weight:800;color:${INK};letter-spacing:-.3px;">${escapeHtml(t)}</h1>`;

export const paragraph = (html) =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.7;color:${BODY};">${html}</p>`;

export const button = (label, href = '#') =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 6px;"><tr><td style="border-radius:12px;background:${BRAND};background-image:linear-gradient(135deg,${BRAND_LT},${BRAND});box-shadow:0 4px 12px rgba(13,44,153,.28);">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(label)} &nbsp;&rarr;</a>
  </td></tr></table>`;

export const divider = () => `<div style="height:1px;background:${LINE};margin:24px 0;"></div>`;

// A boarding-pass style flight card (uses {{placeholders}}, resolved by render()).
export function flightCard() {
  const cell = (label, value) =>
    `<td style="padding:0 18px 0 0;vertical-align:top;">
      <div style="font-family:${MONO};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${label}</div>
      <div style="font-family:${MONO};font-size:15px;font-weight:700;color:${INK};margin-top:3px;">${value}</div>
    </td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border-collapse:separate;">
    <tr>
      <td width="6" style="background:${BRAND};background-image:linear-gradient(180deg,${BRAND_LT},${BRAND});border-radius:14px 0 0 14px;font-size:0;line-height:0;">&nbsp;</td>
      <td style="border:1px solid ${LINE};border-left:0;border-radius:0 14px 14px 0;background:${CARD_BG};padding:18px 20px;">
        ${eyebrow('Your flight')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <div style="font-family:${MONO};font-size:24px;font-weight:800;color:${INK};letter-spacing:1px;">{{callsign}}</div>
          </td>
          <td align="right" style="vertical-align:middle;">
            <span style="font-family:${MONO};font-size:18px;font-weight:800;color:${INK};">{{origin}}</span>
            <span style="font-family:${SANS};font-size:16px;color:${BRAND_LT};padding:0 6px;">&#9992;</span>
            <span style="font-family:${MONO};font-size:18px;font-weight:800;color:${INK};">{{destination}}</span>
          </td>
        </tr></table>
        <div style="border-top:1px dashed ${LINE};margin:14px 0;"></div>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${cell('Slot · UTC', '{{slotTime}}')}${cell('Aircraft', '{{aircraft}}')}${cell('Gate', '{{gate}}')}
        </tr></table>
      </td>
    </tr>
  </table>`;
}

// Event date/time chip block.
export function eventStrip() {
  const chip = (label, value, color) =>
    `<td style="padding-right:14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${LINE};border-radius:10px;"><tr><td style="padding:10px 16px;">
        <div style="font-family:${MONO};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${label}</div>
        <div style="font-family:${SANS};font-size:16px;font-weight:800;color:${color};margin-top:3px;">${value}</div>
      </td></tr></table>
    </td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 22px;"><tr>
    ${chip('Date', '{{eventDate}}', INK)}${chip('Time · UTC', '{{eventTime}}', BRAND_LT)}
  </tr></table>`;
}

// The BYBLOS cedar mark, drawn with CSS-border triangles so it renders in EVERY
// email client (inline SVG and remote images are stripped by Gmail/Outlook).
const cedarMark = (color) => `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr><td align="center" style="font-size:0;line-height:0;padding:0;"><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:8px solid ${color};"></div></td></tr>
  <tr><td align="center" style="font-size:0;line-height:0;padding:0;"><div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:9px solid ${color};"></div></td></tr>
  <tr><td align="center" style="font-size:0;line-height:0;padding:0;"><div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:10px solid ${color};"></div></td></tr>
  <tr><td align="center" style="font-size:0;line-height:0;padding:0;"><div style="width:4px;height:5px;background:${color};margin:0 auto;"></div></td></tr>
</table>`;

/** Branded, responsive email shell with a gradient header + refined footer. */
export function layout({ subject, division, bodyHtml, preheader = '', headerTag = 'Events', footerNote = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eceef5;font-family:${SANS};color:${INK};-webkit-font-smoothing:antialiased;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef5;padding:30px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(9,29,101,.12);">
      <tr><td style="background:${BRAND};background-image:linear-gradient(135deg,${BRAND_LT} 0%,${BRAND} 52%,${BRAND_DK} 100%);padding:24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;padding-right:12px;">${cedarMark('#ffffff')}</td>
              <td style="vertical-align:middle;font-family:${HEAD};font-size:22px;font-weight:800;letter-spacing:.4px;color:#ffffff;">${APP_NAME}</td>
            </tr></table>
          </td>
          <td align="right" style="vertical-align:middle;">
            ${headerTag ? `<span style="display:inline-block;padding:6px 13px;border-radius:999px;background:rgba(255,255,255,.16);font-family:${MONO};font-size:10.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">${escapeHtml(headerTag)}</span>` : ''}
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;background:${BRAND_LT};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:34px 32px 30px;">${bodyHtml}</td></tr>
      <tr><td style="padding:22px 32px;background:${FOOT_BG};border-top:1px solid ${LINE};">
        ${footerNote ? `<div style="font-family:${SANS};font-size:13px;line-height:1.6;color:${BODY};margin:0 0 12px;">${footerNote}</div>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:9px;">${cedarMark(BRAND)}</td>
          <td style="vertical-align:middle;font-family:${HEAD};font-size:13px;font-weight:700;color:${INK};">${APP_NAME} <span style="font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:1.5px;color:${MUTED};">· IVAO ${escapeHtml(division || '')}</span></td>
        </tr></table>
        <div style="font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED};margin-top:8px;">
          ${APP_TAGLINE} by ${APP_OPERATOR} · built by
          <a href="${AUTHOR.url}" style="color:${BRAND_MID};font-weight:700;text-decoration:none;">${AUTHOR.name}</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Turn a plain-text message (with {{placeholders}}) into styled paragraphs.
// The admin never writes HTML; blank lines start new paragraphs.
export function messageToHtml(text) {
  const blocks = String(text || '').trim().split(/\n{2,}/).filter((b) => b.trim());
  return blocks.map((b) => paragraph(escapeHtml(b).replace(/\n/g, '<br>'))).join('');
}

// ── Plain-text alternative (deliverability + accessibility) ──────────────────
/** Build the plain-text version of an email from the composer fields + resolved ctx. */
export function buildText(o = {}, ctx = {}) {
  const R = (t) => renderText(t, ctx).trim();
  const lines = [];
  if (o.title) lines.push(R(o.title).toUpperCase(), '');
  if (o.greeting) lines.push(R(o.greeting), '');
  if (o.message) lines.push(R(o.message), '');
  if (o.showFlightCard) {
    lines.push('YOUR FLIGHT', `  ${R('{{callsign}}')}   ${R('{{origin}}')} -> ${R('{{destination}}')}`,
      `  Slot (UTC): ${R('{{slotTime}}')}   Aircraft: ${R('{{aircraft}}')}   Gate: ${R('{{gate}}')}`, '');
  }
  if (o.showEventStrip) lines.push(`EVENT: ${R('{{eventDate}}')} · ${R('{{eventTime}}')} UTC`, '');
  if (o.ctaShow && o.ctaUrl) lines.push(`${R(o.ctaLabel || 'Open')}: ${R(o.ctaUrl)}`, '');
  lines.push('--', `${APP_NAME} — ${APP_TAGLINE} by ${APP_OPERATOR}`, `Built by ${AUTHOR.name} (${AUTHOR.url})`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A short inbox-preview (preheader) derived from the message. */
export function preheaderFrom(o = {}, ctx = {}) {
  const msg = renderText(o.message || '', ctx).replace(/\s+/g, ' ').trim();
  return msg.slice(0, 140);
}

// Friendly default messages (plain text) shown in the composer.
export const defaultReminderMessage =
  'This is a reminder that {{eventName}} takes place on {{eventDate}} at {{eventTime}}. Your booked flight is shown below. Please connect on the network a few minutes before your slot. See you there!';
export const defaultNotamMessage = 'Please review the update below for your booked flight.\n\nWrite your message here.';

// Fully-editable defaults for each email — every one of these fields is exposed
// in the composer so the admin can customise the whole email (no HTML needed).
export const composerDefaults = {
  reminder: {
    subject: 'Reminder: your flight in {{eventName}}',
    headerTag: 'Reminder',
    label: 'Flight reminder',
    title: '{{eventName}}',
    greeting: 'Hi {{pilotName}},',
    message: defaultReminderMessage,
    showFlightCard: true,
    showEventStrip: true,
    ctaShow: true,
    ctaLabel: 'View event',
    ctaUrl: '',
    footerNote: '',
  },
  confirmReminder: {
    subject: 'Action needed: confirm your flight in {{eventName}}',
    headerTag: 'Confirm booking',
    label: 'Confirm your booking',
    title: '{{eventName}}',
    greeting: 'Hi {{pilotName}},',
    message:
      'Your booking for {{eventName}} on {{eventDate}} at {{eventTime}} is still awaiting confirmation. Please confirm it on the booking page to keep your slot. If it stays unconfirmed, another pilot may claim it.',
    showFlightCard: true,
    showEventStrip: true,
    ctaShow: true,
    ctaLabel: 'Confirm my booking',
    ctaUrl: '',
    footerNote: '',
  },
  notam: {
    subject: 'NOTAM: {{eventName}}',
    headerTag: 'NOTAM',
    label: 'Event NOTAM',
    title: '{{eventName}}',
    greeting: 'Dear {{pilotName}},',
    message: defaultNotamMessage,
    showFlightCard: true,
    showEventStrip: false,
    ctaShow: false,
    ctaLabel: 'View event',
    ctaUrl: '',
    footerNote: '',
  },
};

/** Build the full HTML body from the composer's structured fields (all optional). */
export function buildBody(o = {}) {
  const parts = [];
  if (o.label) parts.push(eyebrow(o.label));
  if (o.title) parts.push(heading(o.title));
  if (o.greeting) parts.push(paragraph(escapeHtml(o.greeting)));
  if (o.showFlightCard) parts.push(flightCard());
  parts.push(messageToHtml(o.message));
  if (o.showEventStrip) parts.push(eventStrip());
  if (o.ctaShow) parts.push(button(o.ctaLabel || 'Open', o.ctaUrl || '#'));
  return parts.join('');
}

/** Events-department report body: editable intro + a table of every booking (inner HTML; wrap in layout()). */
export function reportBody({ event, bookings }, intro = '') {
  const rows = bookings.length
    ? bookings
        .map(
          (b, i) => `<tr style="background:${i % 2 ? CARD_BG : '#ffffff'};">
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${MONO};font-weight:700;color:${INK};">${escapeHtml(b.flightNumber || 'N/A')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${MONO};color:${BRAND_LT};">${escapeHtml(b.origin || '····')} &#9992; ${escapeHtml(b.destination || '····')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${MONO};color:${INK};">${escapeHtml(b.slotTime || 'N/A')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${SANS};color:${INK};">${escapeHtml(b.aircraft || 'N/A')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${SANS};color:${MUTED};text-transform:capitalize;">${escapeHtml(b.status)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${MONO};color:${MUTED};">${escapeHtml(b.pilot || 'N/A')}</td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="6" style="padding:16px;font-family:${SANS};color:${MUTED};">No bookings yet.</td></tr>`;

  const body = `${eyebrow('Bookings report')}
${heading(event.eventName)}
${paragraph(`<span style="color:${MUTED}">${escapeHtml(event.dateLabel || '')} · <strong>${bookings.length}</strong> booking(s)</span>`)}
${intro ? `<div style="font-family:${SANS};font-size:15px;line-height:1.65;color:${BODY};margin:0 0 18px;">${intro}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0;font-size:13px;">
  <thead><tr style="background:${BRAND};background-image:linear-gradient(135deg,${BRAND_LT},${BRAND});">
    ${['Callsign', 'Route', 'Slot (UTC)', 'A/C', 'Status', 'Pilot'].map((h) => `<th style="padding:10px 12px;text-align:left;font-family:${MONO};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#ffffff;">${h}</th>`).join('')}
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
  return body;
}
