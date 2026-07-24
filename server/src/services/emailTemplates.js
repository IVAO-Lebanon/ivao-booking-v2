// Email templates. Table-based, inline-CSS HTML so it renders across mail clients.
// `render` swaps {{placeholders}} for values.

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Replace {{key}} tokens with (HTML-escaped) values from ctx. */
export function render(template, ctx = {}) {
  return String(template || '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => escapeHtml(ctx[k] ?? ''));
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

const BRAND = '#0D2C99';
const INK = '#191a23';
const MUTED = '#606282';
const LINE = '#e6e8f0';
const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
const SANS = "'Nunito Sans',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

// ── Reusable building blocks (all inline-styled) ─────────────────────────────
export const eyebrow = (t) =>
  `<div style="font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${BRAND};margin:0 0 6px;">${escapeHtml(t)}</div>`;

export const heading = (t) =>
  `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:24px;line-height:1.25;font-weight:800;color:${INK};">${escapeHtml(t)}</h1>`;

export const paragraph = (html) =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.65;color:#3d3f54;">${html}</p>`;

export const button = (label, href = '#') =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;"><tr><td style="border-radius:10px;background:${BRAND};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr></table>`;

export const divider = () => `<div style="height:1px;background:${LINE};margin:22px 0;"></div>`;

// A boarding-pass style flight card (uses {{placeholders}}, resolved by render()).
export function flightCard() {
  const cell = (label, value) =>
    `<td style="padding:0 14px 0 0;vertical-align:top;">
      <div style="font-family:${MONO};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${label}</div>
      <div style="font-family:${MONO};font-size:14px;font-weight:700;color:${INK};margin-top:2px;">${value}</div>
    </td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:14px;background:#fafaff;margin:4px 0 20px;">
    <tr><td style="height:6px;background:${BRAND};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:16px 18px;">
      ${eyebrow('Your flight')}
      <div style="font-family:${MONO};font-size:22px;font-weight:800;color:${INK};letter-spacing:.5px;">{{callsign}}</div>
      <div style="font-family:${MONO};font-size:17px;font-weight:700;color:${BRAND};margin:4px 0 14px;">{{origin}} &nbsp;&#9992;&nbsp; {{destination}}</div>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        ${cell('Slot (UTC)', '{{slotTime}}')}${cell('Aircraft', '{{aircraft}}')}${cell('Gate', '{{gate}}')}
      </tr></table>
    </td></tr>
  </table>`;
}

// Event date/time chip block for the reminder.
function eventStrip() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;background:#fafaff;margin:4px 0 20px;">
    <tr><td style="padding:14px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:26px;">
          <div style="font-family:${MONO};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Date</div>
          <div style="font-family:${SANS};font-size:16px;font-weight:800;color:${INK};margin-top:2px;">{{eventDate}}</div>
        </td>
        <td>
          <div style="font-family:${MONO};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Time (UTC)</div>
          <div style="font-family:${MONO};font-size:16px;font-weight:800;color:${BRAND};margin-top:2px;">{{eventTime}}</div>
        </td>
      </tr></table>
    </td></tr>
  </table>`;
}

/** Branded, responsive email shell with a gradient header + refined footer. */
export function layout({ subject, division, bodyHtml, preheader = '', headerTag = 'Events', footerNote = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef0f6;font-family:${SANS};color:${INK};-webkit-font-smoothing:antialiased;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f6;padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(9,29,101,.10);">
      <tr><td style="background:${BRAND};background-image:linear-gradient(135deg,#1037BF 0%,${BRAND} 45%,#091D65 100%);padding:26px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <span style="font-family:${SANS};font-size:20px;font-weight:800;letter-spacing:.4px;color:#ffffff;">IVAO ${escapeHtml(division || '')}</span>
            <span style="font-family:${SANS};font-size:20px;font-weight:500;color:#B6C5F9;"> Booking</span>
          </td>
          <td align="right" style="vertical-align:middle;">
            ${headerTag ? `<span style="font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7E98F4;">${escapeHtml(headerTag)}</span>` : ''}
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;background:#335CEE;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:30px;">${bodyHtml}</td></tr>
      <tr><td style="padding:20px 30px;background:#f6f7fb;border-top:1px solid ${LINE};">
        ${footerNote ? `<div style="font-family:${SANS};font-size:13px;line-height:1.6;color:#3d3f54;margin:0 0 10px;">${footerNote}</div>` : ''}
        <div style="font-family:${SANS};font-size:12px;font-weight:700;color:${INK};">IVAO ${escapeHtml(division || '')} · Events</div>
        <div style="font-family:${MONO};font-size:11px;line-height:1.7;color:${MUTED};margin-top:4px;">
          Sent via the IVAO ${escapeHtml(division || '')} booking system.
        </div>
      </td></tr>
    </table>
    <div style="font-family:${MONO};font-size:11px;color:#9a9db2;margin-top:14px;">You received this because you fly with IVAO ${escapeHtml(division || '')}.</div>
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
    ctaShow: false,
    ctaLabel: 'View event',
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
  report: {
    subject: 'Bookings report for {{eventName}}',
    headerTag: 'Report',
    message: '',
    footerNote: '',
  },
};

/** Build the full body from the composer's structured fields (all optional). */
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
          (b, i) => `<tr style="background:${i % 2 ? '#fafaff' : '#ffffff'};">
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${MONO};font-weight:700;color:${INK};">${escapeHtml(b.flightNumber || 'N/A')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-family:${MONO};color:${BRAND};">${escapeHtml(b.origin || '····')} &#9992; ${escapeHtml(b.destination || '····')}</td>
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
${intro ? `<div style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3d3f54;margin:0 0 18px;">${intro}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0;font-size:13px;">
  <thead><tr style="background:${BRAND};background-image:linear-gradient(135deg,#1037BF,${BRAND});">
    ${['Callsign', 'Route', 'Slot (UTC)', 'A/C', 'Status', 'Pilot'].map((h) => `<th style="padding:10px 12px;text-align:left;font-family:${MONO};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#ffffff;">${h}</th>`).join('')}
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
  return body;
}
