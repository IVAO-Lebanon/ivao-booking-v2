import { format, parseISO } from 'date-fns';

/** Parse a MySQL/ISO datetime string as UTC. */
export function parseUtc(value?: string | null): Date | null {
  if (!value) return null;
  const s = value.includes('T') ? value : value.replace(' ', 'T');
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
  try {
    return parseISO(iso);
  } catch {
    return null;
  }
}

export function fmtUtc(value?: string | null, pattern = 'dd MMM yyyy HH:mm'): string {
  const d = parseUtc(value);
  return d ? `${format(d, pattern)}z` : 'N/A';
}

export function fmtTimeUtc(value?: string | null): string {
  const d = parseUtc(value);
  return d ? `${format(d, 'HH:mm')}z` : 'N/A';
}

export function fmtDateUtc(value?: string | null): string {
  const d = parseUtc(value);
  return d ? format(d, 'dd MMM yyyy') : 'N/A';
}

/** Human "in 3 days" / "2 hours ago" style relative label. */
export function relativeToNow(value?: string | null): string {
  const d = parseUtc(value);
  if (!d) return '';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const fut = diffMs >= 0;
  let label: string;
  if (mins < 60) label = `${mins} min`;
  else if (hours < 48) label = `${hours} h`;
  else label = `${days} d`;
  return fut ? `in ${label}` : `${label} ago`;
}

/** Map i18n-style API error keys to friendly English. */
const MESSAGES: Record<string, string> = {
  'auth.unauthorized': 'Please sign in to continue.',
  'auth.invalidToken': 'Your session is invalid. Please sign in again.',
  'admin.noAdmin': 'You need staff permissions to do that.',
  'book.suspended': 'Your account is suspended from booking.',
  'book.notOwner': 'This slot belongs to another pilot.',
  'book.notActive': 'Booking is not open for this event yet.',
  'book.hasEnded': 'This event has already ended.',
  'book.hasStarted': 'This event has already started.',
  'book.alreadyTaken': 'That slot was just taken by someone else.',
  'book.duplicateNumber': 'That flight number is already used for this event.',
  'book.overlapping': 'This overlaps with another of your booked slots.',
  'book.limitReached': 'You have reached the maximum number of bookings for this event.',
  'book.flightNumberRequired': 'A flight number is required.',
  'book.routeRequired': 'Origin and destination are required.',
  'book.slotTimeRequired': 'A slot time is required.',
  'book.notPrebooked': 'This slot is not awaiting confirmation.',
  'book.tooEarly': 'It is too early to confirm this slot.',
  'event.notFound': 'Event not found.',
  'event.invalidType': 'That event type no longer exists. Pick another.',
  'eventType.duplicate': 'An event type with that code already exists.',
  'eventType.notFound': 'Event type not found.',
  'eventType.inUse': 'This type is used by existing events. Reassign or delete them first.',
  'event.tooLong': 'Events cannot be longer than the allowed maximum.',
  'event.endBeforeStart': 'End time must be after the start time.',
  'event.noAirports': 'Please provide at least one valid ICAO airport.',
  'event.invalidAirport': 'One of the airports is not a valid 4-letter ICAO code.',
  'slot.notFound': 'Slot not found.',
  'file.required': 'Please choose a CSV file.',
  'file.invalidCsv': 'That file could not be read as CSV.',
  'file.empty': 'The CSV file has no rows.',
  'file.rowInvalid': 'A row in the CSV is invalid.',
  'file.tooManyRows': 'Too many rows in the CSV (max 2000).',
  'aircraft.duplicate': 'An aircraft with that ICAO already exists.',
  'scenery.invalidSimulator': 'That simulator no longer exists. Pick another.',
  'simulator.duplicate': 'A simulator with that code already exists.',
  'simulator.notFound': 'Simulator not found.',
  'simulator.inUse': 'This simulator is used by existing sceneries. Reassign or delete them first.',
  'user.cannotSuspendSelf': 'You cannot suspend your own account.',
  'validation.failed': 'Please check the highlighted fields.',
  'email.alreadySent': 'That email has already been sent for this event (one-time only).',
  'email.noRecipients': 'No recipients with an email address for this audience.',
  'email.noEventsDept': 'No events-department address configured. Enter one to send.',
  'email.sendFailed': 'The email could not be delivered. Check the SMTP configuration and try again.',
  'server.error': 'Something went wrong. Please try again.',
};

export function friendlyError(key: string): string {
  return MESSAGES[key] || key;
}
