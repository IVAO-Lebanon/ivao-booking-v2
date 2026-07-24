import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { eventState } from '../utils/eventState.js';
import { getWhazzup } from '../ivao/whazzup.js';

const router = Router();

// Live network overlay for an event: matches booked flights against the Whazzup
// feed by callsign, plus online ATC on the event's airports. The heavy per-flight
// matching only runs while the event is actually in progress.
router.get(
  '/event/:eventId/live',
  asyncHandler(async (req, res) => {
    const event = await queryOne('SELECT * FROM events WHERE id=:id', { id: req.params.eventId });
    if (!event) throw new ApiError(404, 'event.notFound');

    const state = eventState(event);
    const inProgress = event.status === 'scheduled' && state.hasStarted && !state.hasEnded;

    let wz = null;
    try {
      wz = await getWhazzup();
    } catch {
      /* network hiccup — degrade gracefully */
    }

    const connections =
      wz && wz.connections
        ? {
            total: wz.connections.total,
            pilots: wz.connections.pilot,
            atc: wz.connections.atc,
            observers: wz.connections.observer,
            updatedAt: wz.updatedAt,
          }
        : null;

    if (!inProgress || !wz) {
      return res.json({ inProgress, connections, flights: [], atc: [] });
    }

    const airports = (await query('SELECT icao FROM event_airports WHERE eventId=:e', { e: event.id })).map(
      (r) => r.icao
    );
    const slots = await query(
      "SELECT id, flightNumber, origin, destination FROM slots WHERE eventId=:e AND bookingStatus<>'free' AND flightNumber IS NOT NULL",
      { e: event.id }
    );

    const byCallsign = new Map((wz.clients?.pilots || []).map((p) => [p.callsign, p]));
    const flights = slots.map((s) => {
      const p = byCallsign.get(s.flightNumber);
      if (!p) return { slotId: s.id, flightNumber: s.flightNumber, connected: false };
      const lt = p.lastTrack || {};
      return {
        slotId: s.id,
        flightNumber: s.flightNumber,
        connected: true,
        onGround: !!lt.onGround,
        altitude: lt.altitude ?? null,
        groundSpeed: lt.groundSpeed ?? null,
        arrivalDistance: lt.arrivalDistance ?? null,
        state: lt.state || null,
        latitude: lt.latitude ?? null,
        longitude: lt.longitude ?? null,
        dep: p.flightPlan?.departureId ?? null,
        arr: p.flightPlan?.arrivalId ?? null,
      };
    });

    // ATC whose callsign is on one of the event's airports (e.g. OLBA_TWR, OLBA_APP).
    const atc = (wz.clients?.atcs || [])
      .filter((a) => a.callsign && airports.some((icao) => a.callsign.startsWith(icao)))
      .map((a) => ({
        callsign: a.callsign,
        frequency: a.atcSession?.frequency ?? null,
        position: a.atcSession?.position ?? null,
      }))
      .sort((x, y) => x.callsign.localeCompare(y.callsign));

    res.json({ inProgress, connections, flights, atc });
  })
);

export default router;
