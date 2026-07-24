import { z } from 'zod';

const icao = z
  .string()
  .regex(/^[A-Z]{4}$/, 'Must be a 4-letter ICAO code')
  .optional()
  .nullable();

const flightNumber = z
  .string()
  .regex(/^[A-Z0-9]{2,10}$/, 'Invalid flight number')
  .optional()
  .nullable();

const aircraftIcao = z
  .string()
  .regex(/^[A-Z0-9]{2,4}$/, 'Invalid aircraft type')
  .optional()
  .nullable();

// Accepts "YYYY-MM-DD HH:mm:ss" or ISO 8601.
const dateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, 'Invalid date/time')
  .optional()
  .nullable();

export const authDevSchema = z.object({
  vid: z.string().regex(/^\d{4,8}$/, 'VID must be numeric'),
  firstName: z.string().min(1).max(120).default('Dev'),
  lastName: z.string().min(1).max(120).default('User'),
  admin: z.boolean().default(false),
});

export const authIvaoSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
  codeVerifier: z.string().optional().default(''),
});

// Event-type codes are managed by staff (see event_types table), so we accept
// any well-formed code here and verify it exists against the DB in the route.
const eventTypeCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{2,16}$/, 'Invalid event type code');

export const eventTypeSchema = z.object({
  code: eventTypeCode,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(255).optional().default(''),
  opsSlots: z.coerce.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().optional().default(0),
});

// Update keeps the code immutable (it is the primary key and FK target).
export const eventTypeUpdateSchema = eventTypeSchema.omit({ code: true });

export const eventSchema = z.object({
  eventName: z.string().min(1).max(255),
  description: z.string().min(1),
  type: eventTypeCode,
  status: z.enum(['created', 'scheduled', 'finished', 'cancelled']).default('created'),
  dateStart: z.coerce.number().int().positive(), // unix seconds
  dateEnd: z.coerce.number().int().positive(),
  banner: z.string().url(),
  atcBooking: z.string().url(),
  atcBriefing: z.string().url().optional().or(z.literal('')).nullable(),
  pilotBriefing: z.string().url().optional().or(z.literal('')).nullable(),
  publicAccess: z.coerce.boolean().default(true),
  allowBookingAfterStart: z.coerce.boolean().default(false),
  // 0 = unlimited; otherwise the max slots a single pilot may book in this event.
  maxBookingsPerPilot: z.coerce.number().int().min(0).max(999).default(0),
  // Optional note shown to pilots in the booking dialog.
  bookingMessage: z.string().max(2000).optional().or(z.literal('')).nullable(),
  // Offer IVAO-published routes for the flight when booking / viewing details.
  useIvaoRoutes: z.coerce.boolean().default(false),
  airports: z.string().min(4), // comma-separated ICAOs
});

// Robust boolean for CSV/form values. z.coerce.boolean() is wrong for CSV
// because Boolean("0") === true; here "0"/""/"false"/"no" → false, "1"/"true" → true.
const boolFlag = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'y', 'on'].includes(v.trim().toLowerCase());
  return false;
}, z.boolean());

export const slotSchema = z.object({
  flightNumber,
  origin: icao,
  destination: icao,
  aircraft: aircraftIcao,
  gate: z
    .string()
    .regex(/^[A-Za-z0-9]{1,10}$/)
    .optional()
    .nullable(),
  slotTime: dateTime,
  route: z.string().max(2000).optional().nullable(),
});

// Admin bulk slot operations. `ids` are validated to belong to the event in the route.
export const bulkSlotSchema = z.object({
  action: z.enum(['delete', 'free', 'shift']),
  ids: z.array(z.coerce.number().int().positive()).min(1).max(2000),
  minutes: z.coerce.number().int().min(-1440).max(1440).optional(),
});

export const bookSchema = z.object({
  flightNumber,
  origin: icao,
  destination: icao,
  aircraft: aircraftIcao,
  gate: z
    .string()
    .regex(/^[A-Za-z0-9]{1,10}$/)
    .optional()
    .nullable(),
  slotTime: dateTime,
  route: z.string().max(2000).optional().nullable(),
});

// Simulators are staff-managed (see simulators table); accept any well-formed
// code and verify it exists in the route.
const simulatorCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{2,16}$/, 'Invalid simulator code');

export const simulatorSchema = z.object({
  code: simulatorCode,
  name: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const simulatorUpdateSchema = simulatorSchema.omit({ code: true });

export const scenerySchema = z.object({
  icao: z.string().regex(/^[A-Z]{4}$/),
  title: z.string().min(1).max(255),
  license: z.enum(['freeware', 'payware']),
  link: z.string().url(),
  simulator: simulatorCode,
});

export const aircraftSchema = z.object({
  icao: z.string().regex(/^[A-Z0-9]{2,4}$/),
  iata: z.string().max(3).default(''),
  name: z.string().min(1).max(255),
  speed: z.coerce.number().int().nonnegative(),
});

export const userUpdateSchema = z.object({
  suspended: z.coerce.boolean(),
});
