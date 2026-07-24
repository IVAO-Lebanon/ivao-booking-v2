import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plane, MapPin, CloudSun, Mountain, Route as RouteIcon } from 'lucide-react';
import { api } from '../api/client';
import type { AirportBrief, EventModel, Slot } from '../api/types';
import { Modal, Spinner, StatusBadge } from './ui';
// Leaflet is heavy (~150 kB) and only needed once a flight is opened — load it on demand.
const RouteMapLeaflet = lazy(() => import('./RouteMapLeaflet').then((m) => ({ default: m.RouteMapLeaflet })));
import { AirlineLogo } from './AirlineLogo';
import { textureImageUrl, airlineCode } from '../lib/branding';
import { fmtDateUtc, fmtTimeUtc } from '../lib/format';

function useAirport(icao: string | null) {
  return useQuery({
    queryKey: ['airport-brief', icao],
    queryFn: () => api.airportBrief(icao as string),
    enabled: !!icao && /^[A-Z]{4}$/.test(icao),
    staleTime: 5 * 60 * 1000,
  });
}

function hasCoords(a?: AirportBrief | null): a is AirportBrief & { latitude: number; longitude: number } {
  return !!a && typeof a.latitude === 'number' && typeof a.longitude === 'number';
}

function Wx({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-fuselage-400">{label}</div>
      {value ? (
        <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fuselage-700 dark:text-fuselage-200">
          {value}
        </p>
      ) : (
        <p className="mt-0.5 font-mono text-xs text-fuselage-400">Not reporting</p>
      )}
    </div>
  );
}

function AirportCard({ icao, role, q }: { icao: string; role: 'Departure' | 'Arrival'; q: ReturnType<typeof useAirport> }) {
  const a = q.data;
  const dot = role === 'Departure' ? 'bg-success-500' : 'bg-atmos-500';
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-fuselage-400">{role}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-extrabold tracking-tight">{icao}</span>
        {a?.iata && <span className="font-mono text-xs text-fuselage-400">{a.iata}</span>}
      </div>
      {q.isLoading ? (
        <div className="py-4 text-fuselage-400"><Spinner className="h-4 w-4" /></div>
      ) : a?.available ? (
        <>
          <div className="mt-0.5 text-sm font-semibold">{a.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fuselage-500">
            {a.city && (
              <span className="flex items-center gap-1"><MapPin size={12} /> {a.city}{a.countryId ? `, ${a.countryId}` : ''}</span>
            )}
            {typeof a.elevation === 'number' && (
              <span className="flex items-center gap-1"><Mountain size={12} /> {a.elevation} ft</span>
            )}
          </div>
          <div className="mt-3 space-y-2 border-t border-fuselage-150 pt-3 dark:border-fuselage-800">
            <Wx label="METAR" value={a.metar} />
            <Wx label="TAF" value={a.taf} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-fuselage-400">
          Airport data unavailable{a && a.available === false ? ' (needs the IVAO API key on the server)' : ''}.
        </p>
      )}
    </div>
  );
}

export function FlightDetailModal({ slot, event, onClose }: { slot: Slot; event?: EventModel; onClose: () => void }) {
  // Resolve the airline's current livery for this aircraft type (independent of any
  // live session) so it shows for every flight, not just connected ones.
  const airline = airlineCode(slot.flightNumber);
  const liveryQ = useQuery({
    queryKey: ['livery', airline, slot.aircraft],
    queryFn: () => api.livery(airline, slot.aircraft as string),
    enabled: !!airline && !!slot.aircraft,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const liveryUrl = liveryQ.data?.textureId ? textureImageUrl(liveryQ.data.textureId) : '';
  const depQ = useAirport(slot.origin);
  const arrQ = useAirport(slot.destination);
  const dep = depQ.data;
  const arr = arrQ.data;

  // Aircraft full name from the synced IVAO catalogue.
  const acQ = useQuery({
    queryKey: ['aircraft-ref', slot.aircraft],
    queryFn: () => api.aircraftRef(slot.aircraft as string),
    enabled: !!slot.aircraft,
    staleTime: 60 * 60 * 1000,
  });
  const acName = acQ.data
    ? [acQ.data.manufacturer, acQ.data.model && acQ.data.model !== slot.aircraft ? acQ.data.model : null]
        .filter(Boolean)
        .join(' ') || null
    : null;

  // IVAO-published routes — only when the event opted in and both airports are known.
  const wantRoutes = !!event?.useIvaoRoutes && !!slot.origin && !!slot.destination;
  const routeQ = useQuery({
    queryKey: ['ivao-route', slot.origin, slot.destination],
    queryFn: () => api.ivaoRoutes(slot.origin as string, slot.destination as string),
    enabled: wantRoutes,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <Modal open onClose={onClose} title={slot.flightNumber || 'Flight details'} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Summary line */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AirlineLogo flightNumber={slot.flightNumber} className="h-7 max-w-[100px]" />
          <div className="flex items-center gap-2 font-mono text-lg font-bold">
            <span className={slot.origin ? '' : 'text-fuselage-400'}>{slot.origin || '????'}</span>
            <Plane size={16} className="rotate-90 text-atmos-500" />
            <span className={slot.destination ? '' : 'text-fuselage-400'}>{slot.destination || '????'}</span>
          </div>
          <StatusBadge status={slot.bookingStatus} />
          {slot.aircraft && (
            <span className="rounded bg-fuselage-100 px-2 py-0.5 font-mono text-xs font-semibold text-fuselage-600 dark:bg-fuselage-800 dark:text-fuselage-300">
              {slot.aircraft}
              {acName && <span className="ml-1 font-sans font-normal text-fuselage-500">· {acName}</span>}
            </span>
          )}
          {slot.slotTime && (
            <span className="ml-auto font-mono text-sm text-fuselage-500">
              {fmtDateUtc(slot.slotTime)} · {fmtTimeUtc(slot.slotTime)}
            </span>
          )}
        </div>

        {/* Interactive map (only when we have both airports' coordinates) */}
        {hasCoords(dep) && hasCoords(arr) ? (
          <div className="relative">
            <Suspense fallback={<div className="grid h-72 w-full place-items-center rounded-xl border border-fuselage-150 bg-fuselage-950 dark:border-fuselage-800"><Spinner className="h-6 w-6 text-atmos-400" /></div>}>
              <RouteMapLeaflet
                dep={{ lat: dep.latitude, lon: dep.longitude, icao: dep.icao }}
                arr={{ lat: arr.latitude, lon: arr.longitude, icao: arr.icao }}
                liveryUrl={liveryUrl || undefined}
              />
            </Suspense>
            {/* Livery name caption (the plane itself flies the route, rendered inside the map). */}
            {liveryUrl && liveryQ.data?.name && (
              <span className="pointer-events-none absolute bottom-2 left-3 z-[500] max-w-[70%] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
                {liveryQ.data.name}
              </span>
            )}
          </div>
        ) : depQ.isLoading || arrQ.isLoading ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-fuselage-150 bg-fuselage-50 dark:border-fuselage-800 dark:bg-fuselage-900/60">
            <Spinner className="h-5 w-5 text-atmos-500" />
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center gap-2 rounded-xl border border-dashed border-fuselage-200 text-sm text-fuselage-400 dark:border-fuselage-700">
            <CloudSun size={16} /> Route map needs both a departure and arrival airport.
          </div>
        )}

        {/* Airport + weather cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {slot.origin ? <AirportCard icao={slot.origin} role="Departure" q={depQ} /> : null}
          {slot.destination ? <AirportCard icao={slot.destination} role="Arrival" q={arrQ} /> : null}
        </div>

        {/* IVAO-published routes (event opt-in) */}
        {wantRoutes && (
          <div className="panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <RouteIcon size={14} className="text-atmos-500" />
              <span className="eyebrow">IVAO-published routes</span>
            </div>
            {routeQ.isLoading ? (
              <Spinner className="h-4 w-4 text-atmos-500" />
            ) : routeQ.data?.routes?.length ? (
              <ul className="space-y-1.5">
                {routeQ.data.routes.map((r: any, i: number) => (
                  <li key={i} className="break-words font-mono text-xs text-fuselage-700 dark:text-fuselage-200">
                    {r.route || r.routeText || `${slot.origin} → ${slot.destination}`}
                    {r.flightRules && <span className="text-fuselage-400"> · {r.flightRules}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fuselage-400">
                No IVAO-published route for {slot.origin} → {slot.destination}. File your own routing.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
