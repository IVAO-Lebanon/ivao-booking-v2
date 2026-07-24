// Public IVAO Whazzup feed (live network snapshot). No auth, but IVAO bans IPs
// that poll faster than once per 15s — so we fetch at most once per 15s and cache,
// serving all clients from that single snapshot. On error we serve the last good copy.
const WHAZZUP_URL = 'https://api.ivao.aero/v2/tracker/whazzup';
const TTL = 15_000;

let cache = { at: 0, data: null };
let inFlight = null;

export async function getWhazzup() {
  const now = Date.now();
  if (cache.data && now - cache.at < TTL) return cache.data;
  // Coalesce concurrent refreshes into one request.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(WHAZZUP_URL, {
        headers: { 'User-Agent': 'IVAO-Division-Booking' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`whazzup ${res.status}`);
      const data = await res.json();
      cache = { at: Date.now(), data };
      return data;
    } catch (err) {
      if (cache.data) return cache.data; // stale-but-useful
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
