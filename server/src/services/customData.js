// Staff-defined custom airports / aircraft, and the "custom overrides IVAO" merge
// used by the airport + aircraft typeaheads and the flight brief. Custom tables are
// tiny, so a short in-memory cache keeps typeahead keystrokes off MySQL.
import { query } from '../db/pool.js';

const TTL = 30_000;
const cache = { airports: null, aircraft: null };

async function load(kind, sql) {
  const c = cache[kind];
  if (c && c.exp > Date.now()) return c.data;
  const data = await query(sql);
  cache[kind] = { data, exp: Date.now() + TTL };
  return data;
}

/** Drop the caches after any custom-data write so reads reflect it immediately. */
export function invalidateCustomData() {
  cache.airports = null;
  cache.aircraft = null;
}

const rawAirports = () =>
  load('airports', 'SELECT icao, iata, name, city, countryId, latitude, longitude, elevation FROM custom_airports');
const rawAircraft = () => load('aircraft', 'SELECT icao, iata, model, manufacturer, wtc FROM custom_aircraft');

const shapeAirport = (a) => ({
  icao: a.icao,
  iata: a.iata || null,
  name: a.name || a.icao,
  city: a.city || null,
  countryId: a.countryId || null,
  latitude: a.latitude ?? null,
  longitude: a.longitude ?? null,
  elevation: a.elevation ?? null,
  custom: true,
});
const shapeAircraft = (a) => ({
  icao: a.icao,
  iata: a.iata || null,
  model: a.model || a.icao,
  description: null,
  wtc: a.wtc || null,
  manufacturer: a.manufacturer || null,
  custom: true,
});

/** The custom airport for an ICAO (full record incl. coords), or null. */
export async function resolveAirport(icao) {
  const up = String(icao || '').toUpperCase();
  const row = (await rawAirports()).find((a) => String(a.icao).toUpperCase() === up);
  return row ? shapeAirport(row) : null;
}

/** The custom aircraft type for an ICAO, or null. */
export async function resolveAircraftType(icao) {
  const up = String(icao || '').toUpperCase();
  const row = (await rawAircraft()).find((a) => String(a.icao).toUpperCase() === up);
  return row ? shapeAircraft(row) : null;
}

/** Uppercase ICAO set of all custom airports (so slot import treats them as known). */
export async function customAirportIcaoSet() {
  return new Set((await rawAirports()).map((a) => String(a.icao).toUpperCase()));
}

function rank(icaoUp, q) {
  return icaoUp === q ? 0 : icaoUp.startsWith(q) ? 1 : 2;
}

/** Merge IVAO airport search results with custom ones; custom wins on ICAO clash. */
export async function mergeAirportSearch(ivaoResults, q) {
  const up = String(q || '').trim().toUpperCase();
  const lower = up.toLowerCase();
  const customs = (await rawAirports())
    .filter((a) => {
      const icao = String(a.icao).toUpperCase();
      return icao.includes(up) || String(a.name || '').toLowerCase().includes(lower);
    })
    .sort((x, y) => rank(String(x.icao).toUpperCase(), up) - rank(String(y.icao).toUpperCase(), up))
    .map(shapeAirport);
  const overridden = new Set(customs.map((c) => c.icao.toUpperCase()));
  const ivao = (ivaoResults || []).filter((r) => !overridden.has(String(r.icao).toUpperCase()));
  return [...customs, ...ivao].slice(0, 20);
}

/** Merge IVAO aircraft search results with custom ones; custom wins on ICAO clash. */
export async function mergeAircraftSearch(ivaoResults, q) {
  const up = String(q || '').trim().toUpperCase();
  const lower = up.toLowerCase();
  const customs = (await rawAircraft())
    .filter((a) => {
      const icao = String(a.icao).toUpperCase();
      return icao.includes(up) || String(a.model || '').toLowerCase().includes(lower);
    })
    .sort((x, y) => rank(String(x.icao).toUpperCase(), up) - rank(String(y.icao).toUpperCase(), up))
    .map(shapeAircraft);
  const overridden = new Set(customs.map((c) => c.icao.toUpperCase()));
  const ivao = (ivaoResults || []).filter((r) => !overridden.has(String(r.icao).toUpperCase()));
  return [...customs, ...ivao].slice(0, 20);
}
