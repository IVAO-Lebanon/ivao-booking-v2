// Seeds neutral demo data (division-agnostic). Safe to re-run (clears domain tables first).
import { pathToFileURL } from 'url';
import { pool, query } from './pool.js';
import { migrate } from './migrate.js';
import { config } from '../config.js';

const DIV = config.division;

function dt(offsetDays, hour = 12, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function seed() {
  // Ensure schema exists.
  await migrate({ log: () => {} });

  console.log('Clearing existing data…');
  await query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['slots', 'event_airports', 'sceneries', 'audit_log', 'events', 'users']) {
    await query(`TRUNCATE TABLE ${t}`);
  }
  await query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('Seeding users…');
  await query(
    `INSERT INTO users (vid, firstName, lastName, atcRating, pilotRating, email, division, country, isAdmin, suspended) VALUES
      ('540001','Alex','Morgan',5,8,'540001@dev.local',:div,:div,1,0),
      ('540002','Sam','Rivera',3,6,'540002@dev.local',:div,:div,0,0),
      ('540003','Jordan','Blake',4,5,'540003@dev.local',:div,:div,0,0),
      ('540004','Casey','Stone',2,4,'540004@dev.local',:div,:div,0,1)`,
    { div: DIV }
  );

  console.log('Seeding sceneries…');
  await query(
    `INSERT INTO sceneries (icao, title, license, link, simulator) VALUES
      ('EGLL','London Heathrow','payware','https://example.com/egll','msfs'),
      ('EGLL','Heathrow Freeware','freeware','https://example.com/egll-free','xp12'),
      ('LFPG','Paris Charles de Gaulle','freeware','https://example.com/lfpg','msfs')`
  );

  const admin = await query(`SELECT id FROM users WHERE vid='540001'`);
  const adminId = admin[0].id;

  console.log('Seeding events…');
  // A scheduled RFO event based out of a major hub in a few days.
  const rfo = await query(
    `INSERT INTO events (division, eventName, description, type, status, dateStart, dateEnd, banner, atcBooking, atcBriefing, pilotBriefing, publicAccess, allowBookingAfterStart, bookingMessage, createdBy)
     VALUES (:div, :name, :desc, 'rfo', 'scheduled', :ds, :de, :banner, :atc, :atcb, :pb, 1, 0, :msg, :by)`,
    {
      div: DIV,
      name: 'Heathrow Real Ops',
      desc: 'Real Flight Operations at London Heathrow. Book your slot and fly the real schedule!',
      ds: dt(5, 16, 0),
      de: dt(5, 21, 0),
      banner: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200',
      atc: 'https://ivao.aero',
      atcb: 'https://example.com/atc-brief',
      pb: 'https://example.com/pilot-brief',
      msg: 'Please connect at least 15 minutes before your slot and file the standard SID.',
      by: adminId,
    }
  );
  const rfoId = rfo.insertId;

  // A standard RFE arrivals event.
  const rfe = await query(
    `INSERT INTO events (division, eventName, description, type, status, dateStart, dateEnd, banner, atcBooking, publicAccess, createdBy)
     VALUES (:div, :name, :desc, 'rfe', 'scheduled', :ds, :de, :banner, :atc, 1, :by)`,
    {
      div: DIV,
      name: 'Frankfurt Arrivals Rush',
      desc: 'Real Flight Event: arrivals into Frankfurt (EDDF).',
      ds: dt(9, 17, 0),
      de: dt(9, 20, 0),
      banner: 'https://images.unsplash.com/photo-1520437358207-323b43b50729?w=1200',
      atc: 'https://ivao.aero',
      by: adminId,
    }
  );
  const rfeId = rfe.insertId;

  console.log('Seeding event airports…');
  await query(`INSERT INTO event_airports (eventId, icao) VALUES (:e,'EGLL'),(:e,'EGKK')`, { e: rfoId });
  await query(`INSERT INTO event_airports (eventId, icao) VALUES (:e,'EDDF')`, { e: rfeId });

  console.log('Seeding slots…');
  // RFO: departures out of EGLL and arrivals back into EGLL, real 3-letter callsigns.
  const departures = [
    ['BAW201', 'EGLL', 'LFPG', 'A320', 'B4', 16, 10],
    ['DLH427', 'EGLL', 'EDDF', 'A21N', 'B6', 16, 25],
    ['AFR215', 'EGLL', 'LFPO', 'B738', 'C1', 16, 40],
    ['KLM331', 'EGLL', 'EHAM', 'A20N', 'C3', 17, 0],
    ['UAE263', 'EGLL', 'OMDB', 'B77W', 'A2', 17, 15],
  ];
  const arrivals = [
    ['BAW202', 'LFPG', 'EGLL', 'A320', 'B4', 18, 30],
    ['DLH428', 'EDDF', 'EGLL', 'A21N', 'B6', 18, 45],
    ['AFR216', 'LFPO', 'EGLL', 'B738', 'C1', 19, 0],
    ['KLM332', 'EHAM', 'EGLL', 'A20N', 'C3', 19, 15],
    ['UAE264', 'OMDB', 'EGLL', 'B77W', 'A2', 19, 30],
  ];

  for (const [fn, origin, dest, ac, gate, h, m] of [...departures, ...arrivals]) {
    await query(
      `INSERT INTO slots (eventId, flightNumber, isFixedFlightNumber, origin, isFixedOrigin, destination, isFixedDestination, aircraft, isFixedAircraft, gate, slotTime, isFixedSlotTime, bookingStatus)
       VALUES (:eventId, :fn, 1, :origin, 1, :dest, 1, :ac, 1, :gate, :time, 1, 'free')`,
      { eventId: rfoId, fn, origin, dest, ac, gate, time: dt(5, h, m) }
    );
  }

  // RFE: open arrival slots into EDDF (destination fixed, rest open for pilots).
  for (let i = 0; i < 8; i++) {
    await query(
      `INSERT INTO slots (eventId, destination, isFixedDestination, slotTime, isFixedSlotTime, bookingStatus)
       VALUES (:e, 'EDDF', 1, :time, 1, 'free')`,
      { e: rfeId, time: dt(9, 17, i * 20) }
    );
  }

  // A fictional Real Flight Operations event: Beirut (OLBA) <-> Dubai (OMDB) round trip.
  console.log('Seeding Beirut event…');
  const beirut = await query(
    `INSERT INTO events (division, eventName, description, type, status, dateStart, dateEnd, banner, atcBooking, atcBriefing, pilotBriefing, publicAccess, allowBookingAfterStart, maxBookingsPerPilot, bookingMessage, requireConfirmation, confirmDeadlineHours, createdBy)
     VALUES (:div, :name, :desc, 'rfo', 'scheduled', :ds, :de, :banner, :atc, :atcb, :pb, 1, 0, 2, :msg, 1, 48, :by)`,
    {
      div: DIV,
      name: 'Beirut Sunset Ops',
      desc: 'Fly the golden hour out of Beirut Rafic Hariri (OLBA). A full evening bank of departures to Dubai and the inbound wave home. Book your slot and fly the real schedule!',
      ds: dt(7, 15, 0),
      de: dt(7, 20, 0),
      banner: 'https://images.unsplash.com/photo-1543906965-f9520aa2ed8a?w=1200',
      atc: 'https://ivao.aero',
      atcb: 'https://example.com/olba-atc-brief',
      pb: 'https://example.com/olba-pilot-brief',
      msg: 'Connect at least 15 minutes before your slot. Expect runway 16/34 in use and file the standard OLBA SID.',
      by: adminId,
    }
  );
  const beirutId = beirut.insertId;

  await query(`INSERT INTO event_airports (eventId, icao) VALUES (:e,'OLBA'),(:e,'OMDB')`, { e: beirutId });

  await query(
    `INSERT INTO sceneries (icao, title, license, link, simulator) VALUES
      ('OLBA','Beirut Rafic Hariri Intl','payware','https://example.com/olba','msfs2024'),
      ('OMDB','Dubai International','freeware','https://example.com/omdb','xp12')`
  );

  // Departures out of OLBA, then the return wave back into OLBA. Real 3-letter callsigns so logos resolve.
  const olbaOut = [
    ['MEA401', 'OLBA', 'OMDB', 'A21N', 'A1', 15, 10],
    ['UAE958', 'OLBA', 'OMDB', 'B77W', 'A3', 15, 25],
    ['FDB758', 'OLBA', 'OMDB', 'B738', 'B2', 15, 40],
    ['ETD539', 'OLBA', 'OMAA', 'A320', 'B4', 15, 55],
    ['QTR419', 'OLBA', 'OTHH', 'A320', 'C1', 16, 10],
  ];
  const olbaIn = [
    ['MEA402', 'OMDB', 'OLBA', 'A21N', 'A1', 18, 20],
    ['UAE957', 'OMDB', 'OLBA', 'B77W', 'A3', 18, 35],
    ['THY832', 'LTFM', 'OLBA', 'B738', 'B2', 18, 50],
    ['AFR562', 'LFPG', 'OLBA', 'A320', 'B4', 19, 5],
    ['MSR717', 'HECA', 'OLBA', 'A320', 'C1', 19, 20],
  ];

  for (const [fn, origin, dest, ac, gate, h, m] of [...olbaOut, ...olbaIn]) {
    await query(
      `INSERT INTO slots (eventId, flightNumber, isFixedFlightNumber, origin, isFixedOrigin, destination, isFixedDestination, aircraft, isFixedAircraft, gate, slotTime, isFixedSlotTime, bookingStatus)
       VALUES (:eventId, :fn, 1, :origin, 1, :dest, 1, :ac, 1, :gate, :time, 1, 'free')`,
      { eventId: beirutId, fn, origin, dest, ac, gate, time: dt(7, h, m) }
    );
  }

  console.log('✅ Seed complete.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('❌ Seed failed:', err);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
