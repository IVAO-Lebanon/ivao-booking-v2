// A self-contained dark "nav chart": plots a great-circle route between two
// airports as an inline SVG (no map tiles, so it works offline / under strict CSP).
// Coordinates come from the IVAO Data API; the arc is a true great circle.

interface Pt {
  lat: number;
  lon: number;
  icao: string;
}

const R_NM = 3440.065; // Earth radius in nautical miles
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function greatCircle(a: Pt, b: Pt, n = 96): [number, number][] {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lon), φ2 = toRad(b.lat), λ2 = toRad(b.lon);
  const d =
    2 *
    Math.asin(
      Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2)
    );
  if (!d) return [[a.lat, a.lon]];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push([toDeg(Math.atan2(z, Math.hypot(x, y))), toDeg(Math.atan2(y, x))]);
  }
  return out;
}

function distanceNm(a: Pt, b: Pt): number {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), dφ = toRad(b.lat - a.lat), dλ = toRad(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return Math.round(2 * R_NM * Math.asin(Math.sqrt(h)));
}

function bearing(a: Pt, b: Pt): number {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), dλ = toRad(b.lon - a.lon);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
}

export function RouteMap({ dep, arr }: { dep: Pt; arr: Pt }) {
  const W = 640;
  const H = 300;
  const pad = 34;

  const arc = greatCircle(dep, arr);
  const lons = arc.map((p) => p[1]).concat(dep.lon, arr.lon);
  const lats = arc.map((p) => p[0]).concat(dep.lat, arr.lat);
  // Enforce a minimum span so short hops don't zoom to a single pixel.
  const spanLon = Math.max(Math.max(...lons) - Math.min(...lons), 2);
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), 2);
  const cLon = (Math.max(...lons) + Math.min(...lons)) / 2;
  const cLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  // Keep aspect ratio square-ish so the arc isn't distorted; fit the larger span.
  const span = Math.max(spanLon, spanLat) * 1.25;
  const minLon = cLon - span / 2, maxLon = cLon + span / 2;
  const minLat = cLat - span / 2, maxLat = cLat + span / 2;

  const px = (lon: number) => pad + ((lon - minLon) / (maxLon - minLon)) * (W - 2 * pad);
  const py = (lat: number) => pad + ((maxLat - lat) / (maxLat - minLat)) * (H - 2 * pad);

  const path = arc.map(([la, lo], i) => `${i ? 'L' : 'M'}${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join(' ');

  // Graticule: parallels/meridians at a sensible step for the current zoom.
  const step = span > 60 ? 20 : span > 24 ? 10 : span > 8 ? 5 : span > 3 ? 2 : 1;
  const grid: { x1: number; y1: number; x2: number; y2: number; label: string; lx: number; ly: number }[] = [];
  for (let lo = Math.ceil(minLon / step) * step; lo < maxLon; lo += step) {
    grid.push({ x1: px(lo), y1: pad, x2: px(lo), y2: H - pad, label: `${Math.round(lo)}°`, lx: px(lo) + 2, ly: H - pad - 3 });
  }
  for (let la = Math.ceil(minLat / step) * step; la < maxLat; la += step) {
    grid.push({ x1: pad, y1: py(la), x2: W - pad, y2: py(la), label: `${Math.round(la)}°`, lx: pad + 2, ly: py(la) - 3 });
  }

  const dx = px(dep.lon), dy = py(dep.lat), ax = px(arr.lon), ay = py(arr.lat);
  const mid = arc[Math.floor(arc.length / 2)];
  const mx = px(mid[1]), my = py(mid[0]);
  const brg = bearing(dep, arr);

  return (
    <div className="overflow-hidden rounded-xl border border-fuselage-800 bg-fuselage-950">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Route ${dep.icao} to ${arr.icao}`}>
        <defs>
          <radialGradient id="rm-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1342E4" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#040E32" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="#0b1020" />
        <rect width={W} height={H} fill="url(#rm-glow)" />

        {/* graticule */}
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#1e2a4a" strokeWidth="1" />
            <text x={g.lx} y={g.ly} fill="#3a4a72" fontSize="9" fontFamily="monospace">
              {g.label}
            </text>
          </g>
        ))}

        {/* great-circle arc: soft glow under a crisp line */}
        <path d={path} fill="none" stroke="#1342E4" strokeOpacity="0.35" strokeWidth="7" strokeLinecap="round" />
        <path
          d={path}
          fill="none"
          stroke="#7E98F4"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray="2 6"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
        </path>

        {/* aircraft at midpoint, oriented along the track */}
        <g transform={`translate(${mx},${my}) rotate(${brg})`}>
          <path d="M0,-7 L4.5,6 L0,3 L-4.5,6 Z" fill="#B6C5F9" stroke="#0b1020" strokeWidth="0.75" />
        </g>

        {/* departure node (green) */}
        <circle cx={dx} cy={dy} r="6" fill="#2EC662" stroke="#0b1020" strokeWidth="2" />
        <text x={dx} y={dy - 11} fill="#8AE4A9" fontSize="12" fontWeight="700" fontFamily="monospace" textAnchor="middle">
          {dep.icao}
        </text>

        {/* arrival node (blue) */}
        <circle cx={ax} cy={ay} r="6" fill="#335CEE" stroke="#0b1020" strokeWidth="2" />
        <text x={ax} y={ay - 11} fill="#A4B6F7" fontSize="12" fontWeight="700" fontFamily="monospace" textAnchor="middle">
          {arr.icao}
        </text>

        {/* readout */}
        <text x={pad} y={20} fill="#7E98F4" fontSize="11" fontFamily="monospace" fontWeight="700">
          {dep.icao} → {arr.icao}
        </text>
        <text x={W - pad} y={20} fill="#8b8ca9" fontSize="11" fontFamily="monospace" textAnchor="end">
          {distanceNm(dep, arr).toLocaleString()} nm · {String(brg).padStart(3, '0')}°
        </text>
      </svg>
    </div>
  );
}
