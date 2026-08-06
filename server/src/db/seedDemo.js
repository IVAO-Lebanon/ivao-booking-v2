// Populates a spread of DEMO events + slots that exercise every booking restriction,
// so staff can test the system end to end. Idempotent: re-running replaces all events
// whose name starts with "DEMO:" (and their slots). Does NOT touch real events/users.
//
// Run:  node src/db/seedDemo.js     (uses the same .env / DB as the server)
//   or: npm run db:demo
import { query, queryOne, pool } from './pool.js';
import { config } from '../config.js';

const BANNER = 'https://picsum.photos/seed/byblos/1200/400';
const ATC = 'https://www.ivao.aero';

const p2 = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
// A UTC datetime `days` from now (fractional ok) at hour:min.
const at = (days, h = 18, m = 0) => { const d = new Date(Date.now() + days * 86_400_000); d.setUTCHours(h, m, 0, 0); return d; };
const plus = (date, mins) => new Date(date.getTime() + mins * 60_000);

let createdBy = null;

async function addEvent(e) {
  const r = await query(
    `INSERT INTO events
      (division, eventName, description, type, status, dateStart, dateEnd, banner, atcBooking, atcBriefing, pilotBriefing,
       publicAccess, allowBookingAfterStart, maxBookingsPerPilot, bookingMessage, useIvaoRoutes, requireConfirmation,
       confirmOpensHoursBefore, confirmDeadlineHours, createdBy)
     VALUES
      (:division,:eventName,:description,:type,:status,:dateStart,:dateEnd,:banner,:atcBooking,:atcBriefing,:pilotBriefing,
       :publicAccess,:allowBookingAfterStart,:maxBookingsPerPilot,:bookingMessage,:useIvaoRoutes,:requireConfirmation,
       :confirmOpensHoursBefore,:confirmDeadlineHours,:createdBy)`,
    {
      division: config.division,
      status: 'scheduled', banner: BANNER, atcBooking: ATC, atcBriefing: null, pilotBriefing: null,
      publicAccess: 1, allowBookingAfterStart: 0, maxBookingsPerPilot: 0, bookingMessage: null,
      useIvaoRoutes: 0, requireConfirmation: 0, confirmOpensHoursBefore: 168, confirmDeadlineHours: 0,
      createdBy, ...e,
      dateStart: fmt(e.dateStart), dateEnd: fmt(e.dateEnd),
    }
  );
  const eventId = r.insertId;
  // Register the event's hub airport(s). Real events require these (they drive the
  // Departures/Arrivals + Private slot counts for ops events, plus the Airports and
  // recommended-sceneries panels), so every demo event gets them too.
  const icaos = [...new Set((e.airports ?? []).map((a) => a.toUpperCase()))];
  for (const icao of icaos) {
    await query('INSERT INTO event_airports (eventId, icao) VALUES (:e,:i)', { e: eventId, i: icao });
  }
  return eventId;
}

const fx = (v) => (v !== undefined && v !== null && v !== '' ? 1 : 0);
async function addSlots(eventId, slots) {
  for (const s of slots) {
    const origin = s.origin || null;
    const destination = s.destination || null;
    await query(
      `INSERT INTO slots
        (eventId, flightNumber, isFixedFlightNumber, origin, isFixedOrigin, destination, isFixedDestination,
         aircraft, isFixedAircraft, slotTime, isFixedSlotTime, gate, isPrivate, route, bookingStatus)
       VALUES
        (:eventId,:flightNumber,:isFixedFlightNumber,:origin,:isFixedOrigin,:destination,:isFixedDestination,
         :aircraft,:isFixedAircraft,:slotTime,:isFixedSlotTime,:gate,:isPrivate,NULL,'free')`,
      {
        eventId,
        flightNumber: s.flightNumber || null, isFixedFlightNumber: fx(s.flightNumber),
        origin, isFixedOrigin: fx(origin), destination, isFixedDestination: fx(destination),
        aircraft: s.aircraft || null, isFixedAircraft: fx(s.aircraft),
        slotTime: s.slotTime ? fmt(s.slotTime) : null, isFixedSlotTime: fx(s.slotTime),
        gate: s.gate || null,
        isPrivate: origin && destination ? 0 : 1, // open route (missing origin OR dest) = private
      }
    );
  }
}
// slot helper bound to an event start
const S = (start) => (flightNumber, origin, destination, aircraft, mins, gate) =>
  ({ flightNumber, origin, destination, aircraft, slotTime: plus(start, mins), gate });

async function main() {
  const admin = await queryOne("SELECT id FROM users WHERE isAdmin=1 ORDER BY id LIMIT 1");
  createdBy = admin ? admin.id : null;

  await query("DELETE FROM events WHERE eventName LIKE 'DEMO:%'");
  const summary = [];

  // 1) Instant booking + fixed/fillable + overlap + duplicate flight number + booking message
  {
    const start = at(3, 18); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: Instant Booking', description: 'Bookings are instant (no confirmation). Tests fixed vs pilot-fillable fields, the overlap guard, and duplicate flight numbers.', type: 'rfe', dateStart: start, dateEnd: plus(start, 180), bookingMessage: 'Please file your flight plan and connect 10 minutes before your slot.', airports: ['EGLL'] });
    await addSlots(id, [
      s('BAW101', 'EGLL', 'LFPG', 'A320', 0, 'A1'),                 // fully fixed
      { origin: 'EGLL', slotTime: plus(start, 30) },                // origin fixed, everything else pilot-fillable
      s('DLH201', 'EGLL', 'EDDF', 'A21N', 60, 'B2'),               // overlap pair (same time)
      s('AFR301', 'EGLL', 'LFPG', 'A320', 60, 'B3'),               // overlap pair (same time)
    ]);
    summary.push(['DEMO: Instant Booking', 'requireConfirmation=OFF, max=0', 'Book -> instantly "Booked". Row 2 has open fields (pilot fills origin fixed EGLL + rest). Booking DLH201 then AFR301 as the same pilot -> 2nd blocked (overlap, both same time). Booking the open slot with flight "BAW101" -> blocked (duplicate). Booking message shows in the modal.']);
  }

  // 2) Confirmation required, window OPEN now
  {
    const start = at(4, 17); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: Confirmation Required', description: 'Bookings are provisional and must be confirmed. The confirmation window is already open.', type: 'rfe', dateStart: start, dateEnd: plus(start, 180), requireConfirmation: 1, confirmOpensHoursBefore: 8760, confirmDeadlineHours: 0, airports: ['OLBA', 'EGLL'] });
    await addSlots(id, [ s('MEA211', 'OLBA', 'EGLL', 'A332', 0, 'C1'), s('BAW212', 'EGLL', 'OLBA', 'B77W', 30, 'C2') ]);
    summary.push(['DEMO: Confirmation Required', 'requireConfirmation=ON, confirmOpens=far, deadline=0', 'Book -> "Awaiting confirmation" (prebooked). A "Confirm" button is available now; confirm -> "Booked". Cancel also works.']);
  }

  // 3) Confirmation required, window NOT open yet
  {
    const start = at(12, 16); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: Confirm Window Closed', description: 'Confirmation only opens 24h before the event, so it is not open yet.', type: 'rfe', dateStart: start, dateEnd: plus(start, 180), requireConfirmation: 1, confirmOpensHoursBefore: 24, confirmDeadlineHours: 0, airports: ['LFPG', 'EDDF'] });
    await addSlots(id, [ s('AFR331', 'LFPG', 'EDDF', 'A320', 0, 'D1'), s('DLH332', 'EDDF', 'LFPG', 'A21N', 30, 'D2') ]);
    summary.push(['DEMO: Confirm Window Closed', 'requireConfirmation=ON, confirmOpens=24h before (event is ~12 days out)', 'Book -> prebooked, but NO "Confirm" button yet (window opens 24h before start). Confirm becomes available only within 24h of the event.']);
  }

  // 4) Claimable: unconfirmed slot past its claim deadline
  {
    const start = at(1, 15); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: Claimable When Unconfirmed', description: 'The claim deadline has already passed, so any unconfirmed booking can be claimed by another pilot.', type: 'rfe', dateStart: start, dateEnd: plus(start, 180), requireConfirmation: 1, confirmOpensHoursBefore: 168, confirmDeadlineHours: 48, airports: ['OLBA'] });
    await addSlots(id, [ s('UAE401', 'OMDB', 'OLBA', 'A388', 0, 'E1'), s('QTR402', 'OTHH', 'OLBA', 'A35K', 30, 'E2') ]);
    summary.push(['DEMO: Claimable When Unconfirmed', 'requireConfirmation=ON, deadline=48h (already past)', 'Book as Pilot A -> prebooked and immediately "at risk" (past deadline). Log in as Pilot B -> the slot shows a "Claim" button; claiming reassigns it. The holder can still Confirm to secure it.']);
  }

  // 5) One booking per pilot
  {
    const start = at(5, 18); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: One Booking Per Pilot', description: 'Each pilot may hold at most one slot in this event.', type: 'rfe', dateStart: start, dateEnd: plus(start, 240), maxBookingsPerPilot: 1, airports: ['EGLL'] });
    await addSlots(id, [ s('BAW501', 'EGLL', 'LFPG', 'A320', 0, 'F1'), s('DLH502', 'EGLL', 'EDDF', 'A21N', 60, 'F2'), s('AFR503', 'EGLL', 'LFPG', 'A320', 120, 'F3') ]);
    summary.push(['DEMO: One Booking Per Pilot', 'maxBookingsPerPilot=1', 'Book one slot -> ok. Try to book a second -> blocked ("booking limit reached").']);
  }

  // 6) Open-route (private) slots
  {
    const start = at(6, 17); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: Open-Route (Private) Slots', description: 'Slots with an open origin or destination that the pilot fills in.', type: 'mse', dateStart: start, dateEnd: plus(start, 240), airports: ['OLBA'] });
    await addSlots(id, [
      { origin: 'OLBA', slotTime: plus(start, 0), gate: 'G1' },      // origin fixed OLBA, destination open -> private
      { destination: 'OLBA', slotTime: plus(start, 30), gate: 'G2' },// destination fixed OLBA, origin open -> private
      { slotTime: plus(start, 60), gate: 'G3' },                     // both open -> private
    ]);
    summary.push(['DEMO: Open-Route (Private) Slots', 'type=mse; slots with open origin/destination', 'These show a "Private" badge and appear under the Private filter. The pilot fills the open field (origin or destination) when booking.']);
  }

  // 7) RFO directional (departures / arrivals)
  {
    const start = at(7, 18); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: RFO Directional', description: 'Real Flight Operations from/to OLBA with directional departure and arrival slots.', type: 'rfo', dateStart: start, dateEnd: plus(start, 300), airports: ['OLBA'] });
    await addSlots(id, [
      s('MEA701', 'OLBA', 'OMDB', 'A332', 0, 'H1'),   // departure (OLBA out)
      s('MEA702', 'OLBA', 'LTFM', 'A321', 20, 'H2'),  // departure
      s('UAE703', 'OMDB', 'OLBA', 'B77W', 40, 'H3'),  // arrival (OLBA in)
      s('THY704', 'LTFM', 'OLBA', 'A21N', 60, 'H4'),  // arrival
    ]);
    summary.push(['DEMO: RFO Directional', 'type=rfo (ops slots)', 'Slot list shows Departures / Arrivals filter tabs (departures leave OLBA, arrivals land at OLBA).']);
  }

  // 8) In progress, late booking allowed
  {
    const start = at(-0.05, new Date().getUTCHours()); // ~1h ago
    const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: In Progress (late booking allowed)', description: 'The event has already started; booking after start is allowed here.', type: 'rfe', dateStart: at(-1 / 24, new Date().getUTCHours()), dateEnd: plus(new Date(), 180), allowBookingAfterStart: 1, airports: ['EGLL'] });
    await addSlots(id, [ s('BAW801', 'EGLL', 'LFPG', 'A320', 30, 'J1'), s('DLH802', 'EGLL', 'EDDF', 'A21N', 60, 'J2') ]);
    summary.push(['DEMO: In Progress (late booking allowed)', 'started already, allowBookingAfterStart=ON', 'Event shows LIVE / in progress; you can still book. (To see the opposite, edit an in-progress event and turn allowBookingAfterStart OFF -> booking is blocked.)']);
  }

  // 9) Hidden (non-public) event
  {
    const start = at(8, 18); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: Hidden (staff only)', description: 'Not public: only staff can see this event; pilots cannot list or open it.', type: 'rfe', dateStart: start, dateEnd: plus(start, 180), publicAccess: 0, airports: ['OLBA'] });
    await addSlots(id, [ s('MEA901', 'OLBA', 'LCLK', 'A320', 0, 'K1') ]);
    summary.push(['DEMO: Hidden (staff only)', 'publicAccess=OFF', 'Admins see it in the events list; pilots do NOT (hidden from the public list, and opening its URL gives 404).']);
  }

  // 10) Cancelled event
  {
    const start = at(9, 18); const s = S(start);
    const id = await addEvent({ eventName: 'DEMO: Cancelled Event', description: 'This event is cancelled.', type: 'rfe', status: 'cancelled', dateStart: start, dateEnd: plus(start, 180), airports: ['OLBA'] });
    await addSlots(id, [ s('AFR1001', 'LFPG', 'OLBA', 'A332', 0, 'L1') ]);
    summary.push(['DEMO: Cancelled Event', 'status=cancelled', 'Hidden from the public events list; admins still see it (status Cancelled). Sending a Cancellation notice is a manual action on its Email page.']);
  }

  // eslint-disable-next-line no-console
  console.log(`\nSeeded ${summary.length} DEMO events (createdBy=${createdBy}).\n`);
  for (const [name, cfg, test] of summary) console.log(`• ${name}\n    config: ${cfg}\n    test:   ${test}\n`);
  await pool.end();
}

main().catch((e) => { console.error('seedDemo failed:', e.message); process.exit(1); });
