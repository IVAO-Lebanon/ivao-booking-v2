export interface User {
  id: number;
  vid: string;
  firstName: string;
  lastName: string;
  atcRating: number;
  pilotRating: number;
  division: string;
  country: string;
  isAdmin: boolean;
  suspended: boolean;
  createdAt?: string;
}

export type EventStatus = 'created' | 'scheduled' | 'finished' | 'cancelled';

export interface EventTypeModel {
  code: string;
  name: string;
  description: string;
  opsSlots: boolean;
  sortOrder: number;
}

export interface Scenery {
  id: number;
  icao: string;
  title: string;
  license: 'freeware' | 'payware';
  link: string;
  simulator: string;
}

export interface SimulatorModel {
  code: string;
  name: string;
  sortOrder: number;
}

export interface EventModel {
  id: number;
  division: string;
  eventName: string;
  description: string;
  type: string;
  typeName: string;
  opsSlots: boolean;
  status: EventStatus;
  dateStart: string;
  dateEnd: string;
  banner: string;
  atcBooking: string;
  atcBriefing?: string | null;
  pilotBriefing?: string | null;
  publicAccess: number | boolean;
  allowBookingAfterStart: number | boolean;
  maxBookingsPerPilot: number;
  bookingMessage: string | null;
  useIvaoRoutes: number | boolean;
  requireConfirmation: number | boolean;
  confirmOpensHoursBefore: number;
  confirmDeadlineHours: number;
  airports: string[];
  sceneries: Scenery[];
  hasStarted: boolean;
  hasEnded: boolean;
  inProgress: boolean;
  canConfirmSlots: boolean;
  pastConfirmDeadline: boolean;
  confirmOpensAt: string | null;
  confirmDeadline: string | null;
  // Present only on the response to an event update: what the save reconciled.
  applied?: EventUpdateApplied;
}

/** Side effects an event edit would have on existing bookings (409 preview). */
export interface ReconcileSummary {
  confirmPending: number;
  dateShift: { deltaMinutes: number; timedSlots: number } | null;
  overLimit: number;
}

/** What an applied event update actually did to existing bookings. */
export interface EventUpdateApplied {
  confirmedPending: number;
  slotsShifted: number;
  overLimit: number;
}

export interface IvaoEventRoute {
  departureIcao: string;
  arrivalIcao: string;
  route: string;
}

export interface IvaoImportEvent {
  id: number;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  imageUrl: string;
  infoUrl: string;
  airports: string[];
  eventType: string;
  divisions: string[];
  routes: IvaoEventRoute[] | null;
}

export interface IvaoImport {
  division: string;
  events: IvaoImportEvent[];
}

export type BookingStatus = 'free' | 'prebooked' | 'booked';

export interface SlotOwner {
  vid: string;
  firstName: string;
  lastName: string;
}

export interface Slot {
  id: number;
  eventId: number;
  pilotId: number | null;
  flightNumber: string | null;
  isFixedFlightNumber: boolean;
  origin: string | null;
  isFixedOrigin: boolean;
  destination: string | null;
  isFixedDestination: boolean;
  slotTime: string | null;
  isFixedSlotTime: boolean;
  gate: string | null;
  aircraft: string | null;
  isFixedAircraft: boolean;
  isPrivate: boolean;
  route: string | null;
  bookingStatus: BookingStatus;
  bookingTime: string | null;
  claimable?: boolean;
  owner: SlotOwner | null;
}

export interface AirportBrief {
  icao: string;
  iata?: string | null;
  name?: string;
  city?: string | null;
  countryId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation?: number | null;
  available: boolean;
  metar: string | null;
  taf: string | null;
}

// An aircraft type from the IVAO catalogue (typeahead results).
export interface AircraftType {
  icao: string;
  iata: string | null;
  model: string;
  description?: string | null;
  wtc?: string | null;
  manufacturer?: string | null;
  custom?: boolean;
}

/** A staff-defined custom airport (supplements/overrides the IVAO catalogue). */
export interface CustomAirport {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  countryId: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
}

/** A staff-defined custom aircraft type. */
export interface CustomAircraft {
  icao: string;
  iata: string | null;
  model: string;
  manufacturer: string | null;
  wtc: string | null;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface SlotCounts {
  departure?: number;
  landing?: number;
  privateDeparture?: number;
  privateLanding?: number;
  total?: number;
  booked?: number;
  free?: number;
}

export interface LiveFlight {
  slotId: number;
  flightNumber: string;
  connected: boolean;
  onGround?: boolean;
  altitude?: number | null;
  groundSpeed?: number | null;
  arrivalDistance?: number | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  dep?: string | null;
  arr?: string | null;
  textureId?: number | null;
}

export interface LiveAtc {
  callsign: string;
  frequency?: number | null;
  position?: string | null;
}

export interface EventLive {
  inProgress: boolean;
  connections: { total: number; pilots: number; atc: number; observers: number; updatedAt: string } | null;
  flights: LiveFlight[];
  atc: LiveAtc[];
}

export interface EmailFields {
  subject: string;
  headerTag?: string;
  label?: string;
  title?: string;
  greeting?: string;
  message: string;
  showFlightCard?: boolean;
  showEventStrip?: boolean;
  ctaShow?: boolean;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  to?: string;
}

export interface EmailLogEntry {
  id: number;
  type: string;
  subject: string;
  recipients: number;
  sent: number;
  failed: number;
  createdAt: string;
}

export interface EmailRecipient {
  vid: string;
  name: string;
  ok: boolean;
  error: string | null;
  createdAt: string;
}

export type EmailType = 'reminder' | 'confirmReminder' | 'notam' | 'cancellation';

export interface EmailStatus {
  configured: boolean;
  participantCount: number;
  unconfirmedCount: number;
  requireConfirmation: boolean;
  placeholders: { key: string; label: string }[];
  defaults: Record<EmailType, EmailFields>;
  log: EmailLogEntry[];
}

export interface EmailResult {
  sent: number;
  failed: number;
  total: number;
}

export interface AdminStats {
  events: number;
  upcoming: number;
  users: number;
  suspended: number;
  slots: number;
  booked: number;
}
