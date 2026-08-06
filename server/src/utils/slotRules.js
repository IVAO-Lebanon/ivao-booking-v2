// Event-type slot rules. Ported from the original SlotRuleFactory but with a
// consistent interface (the original's fallback class had an incompatible
// signature that crashed non-RFO events).

import { query, queryOne } from '../db/pool.js';

async function eventIcaos(eventId) {
  const rows = await query('SELECT icao FROM event_airports WHERE eventId = :e', { e: eventId });
  return rows.map((r) => r.icao);
}

const rfoRule = {
  /** Adds SQL WHERE fragments for a given "type" filter. Returns { sql, params }. */
  async buildTypeFilter(eventId, value) {
    const icaos = await eventIcaos(eventId);
    if (icaos.length === 0) return { sql: '', params: {} };
    const inList = icaos.map((_, i) => `:ic${i}`).join(',');
    const params = Object.fromEntries(icaos.map((ic, i) => [`ic${i}`, ic]));

    switch (value) {
      case 'takeoff':
        return { sql: ` AND origin IN (${inList}) AND destination NOT IN (${inList}) AND isPrivate = 0`, params };
      case 'landing':
        return { sql: ` AND destination IN (${inList}) AND origin NOT IN (${inList}) AND isPrivate = 0`, params };
      case 'private_takeoff':
        return { sql: ` AND isFixedOrigin = 1 AND isFixedDestination = 0 AND isPrivate = 1`, params: {} };
      case 'private_landing':
        return { sql: ` AND isFixedOrigin = 0 AND isFixedDestination = 1 AND isPrivate = 1`, params: {} };
      case 'private':
        return { sql: ` AND isPrivate = 1`, params: {} };
      default:
        return { sql: '', params: {} };
    }
  },
};

// Default rule for non-ops events - no special type filtering.
const defaultRule = {
  async buildTypeFilter() {
    return { sql: '', params: {} };
  },
};

// An event type uses directional/private (RFO-style) slots when its catalogue
// entry has opsSlots set. Falls back to the default rule for unknown types.
export async function ruleFor(eventType) {
  const t = await queryOne('SELECT opsSlots FROM event_types WHERE code = :c', { c: String(eventType).toLowerCase() });
  return t && t.opsSlots ? rfoRule : defaultRule;
}
