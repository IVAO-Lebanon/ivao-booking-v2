// Periodically loads IVAO's full airport + aircraft catalogues into local
// reference tables. These lists are large (~45k airports, ~2.6k aircraft) so we
// never fetch them per request — they're synced on boot (if empty) and daily.
import { pool, query } from '../db/pool.js';
import { getAllAirports, getAllAircraft, hasApiKey } from './dataApi.js';

export async function ensureRefTables() {
  await query(`CREATE TABLE IF NOT EXISTS airports_ref (
    icao       VARCHAR(8)  NOT NULL PRIMARY KEY,
    iata       VARCHAR(4)  NULL,
    name       VARCHAR(255) NOT NULL DEFAULT '',
    city       VARCHAR(120) NULL,
    countryId  VARCHAR(4)  NULL,
    latitude   DOUBLE      NULL,
    longitude  DOUBLE      NULL,
    elevation  INT         NULL,
    KEY idx_airports_ref_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await query(`CREATE TABLE IF NOT EXISTS aircraft_ref (
    icao         VARCHAR(8)  NOT NULL PRIMARY KEY,
    iata         VARCHAR(4)  NULL,
    model        VARCHAR(160) NOT NULL DEFAULT '',
    description  VARCHAR(160) NULL,
    wtc          VARCHAR(4)  NULL,
    manufacturer VARCHAR(120) NULL,
    KEY idx_aircraft_ref_model (model)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

// Bulk INSERT … ON DUPLICATE KEY UPDATE using positional params (pool.query),
// in batches so we stay well under MySQL's placeholder limit.
async function bulkUpsert(table, cols, rows, updateCols, batch = 400) {
  let n = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const updates = updateCols.map((c) => `${c}=VALUES(${c})`).join(',');
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`;
    await pool.query(sql, chunk.flat());
    n += chunk.length;
  }
  return n;
}

const str = (v, max) => (v == null ? null : String(v).slice(0, max));

export async function syncAirports() {
  const data = await getAllAirports();
  const list = Array.isArray(data) ? data : data?.items || [];
  const cols = ['icao', 'iata', 'name', 'city', 'countryId', 'latitude', 'longitude', 'elevation'];
  const rows = list
    .filter((a) => a && a.icao)
    .map((a) => [
      str(a.icao, 8),
      str(a.iata, 4),
      str(a.name, 255) || a.icao,
      str(a.city, 120),
      str(a.countryId, 4),
      a.latitude ?? null,
      a.longitude ?? null,
      Number.isFinite(a.elevation) ? a.elevation : null,
    ]);
  return bulkUpsert('airports_ref', cols, rows, cols.slice(1));
}

export async function syncAircraft() {
  const data = await getAllAircraft();
  const list = Array.isArray(data) ? data : data?.items || [];
  const cols = ['icao', 'iata', 'model', 'description', 'wtc', 'manufacturer'];
  const rows = list
    .filter((a) => a && a.icaoCode)
    .map((a) => [
      str(a.icaoCode, 8),
      str(a.iataCode, 4),
      str(a.model, 160) || a.icaoCode,
      str(a.description, 160),
      str(a.wakeTurbulence, 4),
      str(a.manufacture?.name, 120),
    ]);
  return bulkUpsert('aircraft_ref', cols, rows, cols.slice(1));
}

let running = false;

/** Sync both catalogues. By default only fills empty tables; force refreshes them. */
export async function runSync({ force = false, log = console.log } = {}) {
  if (!hasApiKey() || running) return;
  running = true;
  try {
    await ensureRefTables();
    const ac = (await query('SELECT COUNT(*) c FROM airports_ref'))[0].c;
    const ic = (await query('SELECT COUNT(*) c FROM aircraft_ref'))[0].c;
    if (force || ac === 0) {
      const n = await syncAirports();
      log(`✈️  synced ${n} airports from IVAO`);
    }
    if (force || ic === 0) {
      const n = await syncAircraft();
      log(`🛩️  synced ${n} aircraft from IVAO`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('IVAO reference sync failed:', err.message);
  } finally {
    running = false;
  }
}
