// Thin client for the IVAO Data API (airports, weather, aircraft), authenticated
// with the division apiKey. Everything is cached in-memory so we never hammer
// IVAO: airport/aircraft reference data is effectively static (24h), weather ~10min.
import { config } from '../config.js';

const BASE = config.ivao.apiEndpoint; // https://api.ivao.aero/v2
const HEADERS = () => ({ apiKey: config.ivao.apiKey, 'User-Agent': 'IVAO-Division-Booking' });

export function hasApiKey() {
  return Boolean(config.ivao.apiKey);
}

const DAY = 24 * 60 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

// Generic tiny TTL cache. Stores null results too (e.g. "no METAR") so we don't refetch.
function makeCache() {
  const m = new Map();
  return {
    get(key) {
      const hit = m.get(key);
      return hit && hit.expires > Date.now() ? hit : null;
    },
    set(key, data, ttl) {
      m.set(key, { data, expires: Date.now() + ttl });
    },
  };
}

const airportCache = makeCache();
const metarCache = makeCache();
const tafCache = makeCache();
const aircraftCache = makeCache();

async function ivaoGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS() });
  return res;
}

export async function getAirport(icao) {
  const cached = airportCache.get(icao);
  if (cached) return cached.data;
  const res = await ivaoGet(`/airports/${icao}`);
  if (res.status === 404) {
    airportCache.set(icao, null, DAY);
    return null;
  }
  if (!res.ok) throw new Error(`airport ${res.status}`);
  const data = await res.json();
  airportCache.set(icao, data, DAY);
  return data;
}

// Weather can legitimately be missing (404) — treated as null, not an error.
export async function getMetar(icao) {
  const cached = metarCache.get(icao);
  if (cached) return cached.data;
  const res = await ivaoGet(`/airports/${icao}/metar`);
  let value = null;
  if (res.ok) {
    const body = await res.json().catch(() => null);
    value = body?.metar ?? (typeof body === 'string' ? body : null);
  }
  metarCache.set(icao, value, TEN_MIN);
  return value;
}

export async function getTaf(icao) {
  const cached = tafCache.get(icao);
  if (cached) return cached.data;
  const res = await ivaoGet(`/airports/${icao}/taf`);
  let value = null;
  if (res.ok) {
    const body = await res.json().catch(() => null);
    value = body?.taf ?? (typeof body === 'string' ? body : null);
  }
  tafCache.set(icao, value, TEN_MIN);
  return value;
}

export async function getAircraft(icao) {
  const cached = aircraftCache.get(icao);
  if (cached) return cached.data;
  const res = await ivaoGet(`/aircrafts/${icao}`);
  const data = res.ok ? await res.json().catch(() => null) : null;
  aircraftCache.set(icao, data, DAY);
  return data;
}

// Full reference catalogues, fetched from IVAO and cached in memory (24h). We do
// NOT persist these in our own DB — the IVAO API is the source of truth; this is
// just a transient cache so typeahead searches don't refetch the whole list.
const catalogueCache = makeCache();
async function getCatalogue(kind, path) {
  const cached = catalogueCache.get(kind);
  if (cached) return cached.data;
  const res = await ivaoGet(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body?.items || [];
  catalogueCache.set(kind, list, DAY);
  return list;
}

export const getAllAirports = () => getCatalogue('airports', '/airports/all');
export const getAllAircraft = () => getCatalogue('aircraft', '/aircrafts/all');

const mapAirport = (a) => ({ icao: a.icao, iata: a.iata || null, name: a.name || a.icao, city: a.city || null, countryId: a.countryId || null });
const mapAircraftType = (a) => ({ icao: a.icaoCode, iata: a.iataCode || null, model: a.model || a.icaoCode, description: a.description || null, wtc: a.wakeTurbulence || null, manufacturer: a.manufacture?.name || null });

/** Airport typeahead (ICAO prefix or name substring), ranked, from the cached IVAO catalogue. */
export async function searchAirports(q) {
  const s = String(q || '').trim();
  if (s.length < 2) return [];
  const up = s.toUpperCase();
  const lower = s.toLowerCase();
  const list = await getAllAirports();
  const scored = [];
  for (const a of list) {
    if (!a || !a.icao) continue;
    const icao = String(a.icao).toUpperCase();
    const prefix = icao.startsWith(up);
    if (!prefix && !icao.includes(up) && !String(a.name || '').toLowerCase().includes(lower)) continue;
    scored.push({ rank: icao === up ? 0 : prefix ? 1 : 2, a });
  }
  scored.sort((x, y) => x.rank - y.rank || String(x.a.name || '').localeCompare(String(y.a.name || '')));
  return scored.slice(0, 20).map(({ a }) => mapAirport(a));
}

/** Aircraft-type typeahead (ICAO prefix or model substring) from the cached IVAO catalogue. */
export async function searchAircraft(q) {
  const s = String(q || '').trim();
  if (!s) return [];
  const up = s.toUpperCase();
  const lower = s.toLowerCase();
  const list = await getAllAircraft();
  const scored = [];
  for (const a of list) {
    if (!a || !a.icaoCode) continue;
    const icao = String(a.icaoCode).toUpperCase();
    const prefix = icao.startsWith(up);
    if (!prefix && !String(a.model || '').toLowerCase().includes(lower)) continue;
    scored.push({ rank: icao === up ? 0 : prefix ? 1 : 2, a });
  }
  scored.sort((x, y) => x.rank - y.rank || String(x.a.icaoCode).localeCompare(String(y.a.icaoCode)));
  return scored.slice(0, 20).map(({ a }) => mapAircraftType(a));
}

/** Single aircraft type by ICAO, from the cached IVAO catalogue. */
export async function getAircraftType(icao) {
  const up = String(icao || '').toUpperCase();
  const list = await getAllAircraft();
  const a = list.find((x) => String(x.icaoCode).toUpperCase() === up);
  return a ? mapAircraftType(a) : { icao: up, available: false };
}

const routeCache = makeCache();
// IVAO-published routes between two airports. Cached 1h per pair.
export async function getRoutes(dep, arr) {
  const key = `${dep}-${arr}`;
  const cached = routeCache.get(key);
  if (cached) return cached.data;
  const res = await ivaoGet(`/routes?departureId=${dep}&arrivalId=${arr}&perPage=10`);
  const body = res.ok ? await res.json().catch(() => null) : null;
  const items = body?.items ?? (Array.isArray(body) ? body : []);
  routeCache.set(key, items, 60 * 60 * 1000);
  return items;
}

// All active liveries an airline has (grouped by aircraft), cached 24h per airline.
const airlineTexCache = makeCache();
export async function getAirlineTextures(airline) {
  const cached = airlineTexCache.get(airline);
  if (cached) return cached.data;
  const res = await ivaoGet(
    `/aircrafts/all/textures?airlineId=${airline}&isActive=true&hasTextures=true&perPage=300`
  );
  const body = res.ok ? await res.json().catch(() => null) : null;
  const items = body?.items ?? (Array.isArray(body) ? body : []);
  airlineTexCache.set(airline, items, DAY);
  return items;
}

// MTL livery render (a transparent PNG of the aircraft in its texture/livery).
// Cached in-memory by texture id (24h) so we don't refetch ~100KB each time.
const textureImgCache = new Map();
export async function getTextureImage(id) {
  const hit = textureImgCache.get(id);
  if (hit && Date.now() - hit.at < DAY) return hit;
  const res = await ivaoGet(`/aircraftsTextures/${id}/files/latest/image`);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const rec = { at: Date.now(), contentType: res.headers.get('content-type') || 'image/png', buffer };
  if (textureImgCache.size > 300) textureImgCache.clear(); // simple bound
  textureImgCache.set(id, rec);
  return rec;
}

/** Airport essentials + live weather in one shot, for the flight detail view. */
export async function getAirportBrief(icao) {
  const [airport, metar, taf] = await Promise.all([
    getAirport(icao).catch(() => null),
    getMetar(icao).catch(() => null),
    getTaf(icao).catch(() => null),
  ]);
  if (!airport) return { icao, available: false, metar, taf };
  return {
    icao: airport.icao,
    iata: airport.iata || null,
    name: airport.name || icao,
    city: airport.city || null,
    countryId: airport.countryId || null,
    latitude: airport.latitude ?? null,
    longitude: airport.longitude ?? null,
    elevation: airport.elevation ?? null,
    available: true,
    metar,
    taf,
  };
}
