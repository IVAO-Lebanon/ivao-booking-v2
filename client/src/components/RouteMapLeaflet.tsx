import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../lib/theme';

interface Pt {
  lat: number;
  lon: number;
  icao: string;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// Interpolate a great circle so the drawn line curves like a real route.
function greatCircle(a: Pt, b: Pt, n = 160): [number, number][] {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lon), φ2 = toRad(b.lat), λ2 = toRad(b.lon);
  const d =
    2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
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

/** Real interactive map (Leaflet + CARTO tiles) with an animated livery flying the route. */
export function RouteMapLeaflet({ dep, arr, liveryUrl }: { dep: Pt; arr: Pt; liveryUrl?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });

    const tiles =
      theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tiles, { attribution: '© OpenStreetMap contributors © CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);

    const arc = greatCircle(dep, arr);
    // Soft glow under a crisp, flowing dashed line.
    L.polyline(arc, { color: '#1342E4', weight: 9, opacity: 0.16, lineCap: 'round' }).addTo(map);
    const line = L.polyline(arc, { color: '#9DB8E0', weight: 2.5, opacity: 0.95, dashArray: '1 9', lineCap: 'round', className: 'rm-flow' }).addTo(map);

    const node = (latlng: [number, number], color: string, icao: string, role: 'dep' | 'arr') => {
      L.circleMarker(latlng, { radius: 13, stroke: false, fillColor: color, fillOpacity: 0.16 }).addTo(map); // halo
      L.circleMarker(latlng, { radius: 5.5, color: '#0b1020', weight: 2, fillColor: color, fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(icao, { permanent: true, direction: 'top', offset: [0, -6], className: `rm-tip rm-${role}` });
    };
    node([dep.lat, dep.lon], '#2EC662', dep.icao, 'dep');
    node([arr.lat, arr.lon], '#335CEE', arr.icao, 'arr');

    map.fitBounds(line.getBounds(), { padding: [48, 48], maxZoom: 8 });

    // ── Animated livery flying dep → arr along the arc (nose follows the path) ──
    let raf = 0;
    let plane: HTMLImageElement | null = null;
    const N = arc.length;
    if (liveryUrl && N >= 2) {
      plane = document.createElement('img');
      plane.src = liveryUrl;
      Object.assign(plane.style, {
        position: 'absolute', left: '0', top: '0', width: '150px', height: '100px',
        objectFit: 'contain', transformOrigin: 'center', pointerEvents: 'none', zIndex: '500',
        filter: 'drop-shadow(0 6px 16px rgba(0,0,0,.55))', willChange: 'transform,left,top',
        opacity: '0', transition: 'opacity .4s',
      });
      map.getContainer().appendChild(plane);
      plane.onload = () => plane && (plane.style.opacity = '1');

      const DURATION = 18000; // one dep→arr pass, then loops
      const MIN = 0.42, MAX = 1;
      // Heading is measured over a window of the route (~6%) so it stays stable even
      // when the whole route is zoomed out and adjacent points are sub-pixel apart.
      const LOOK = Math.max(2, Math.round(N * 0.06));
      const east = arr.lon > dep.lon;
      const sx = east ? -1 : 1;
      const startT = performance.now();
      const proj = (pt: [number, number]) => map.latLngToContainerPoint([pt[0], pt[1]]);
      let rotState: number | null = null; // smoothed rotation

      const tick = (now: number) => {
        if (plane) {
          const t = ((now - startT) % DURATION) / DURATION;
          const fpos = t * (N - 1);
          const i = Math.max(0, Math.min(N - 2, Math.floor(fpos)));
          const frac = fpos - i;
          const pa = proj(arc[i]);
          const pb = proj(arc[i + 1]);
          const cx = pa.x + (pb.x - pa.x) * frac;
          const cy = pa.y + (pb.y - pa.y) * frac;

          const lo = proj(arc[Math.max(0, i - LOOK)]);
          const hi = proj(arc[Math.min(N - 1, i + LOOK)]);
          const dx = hi.x - lo.x, dy = hi.y - lo.y;
          if (Math.hypot(dx, dy) > 3) {
            const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
            const target = east ? deg : deg + 180;
            if (rotState === null) rotState = target;
            const d = ((target - rotState + 540) % 360) - 180; // shortest signed delta
            rotState += d * 0.06; // gentle low-pass smoothing (slower turn)
          }
          const s = MIN + (MAX - MIN) * Math.sin(t * Math.PI);
          plane.style.left = `${cx - 75}px`;
          plane.style.top = `${cy - 50}px`;
          plane.style.transform = `rotate(${rotState ?? 0}deg) scale(${s}) scaleX(${sx})`;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      if (plane) plane.remove();
      map.remove();
    };
  }, [dep.lat, dep.lon, arr.lat, arr.lon, dep.icao, arr.icao, theme, liveryUrl]);

  return (
    <div
      ref={ref}
      className="h-72 w-full overflow-hidden rounded-xl border border-fuselage-150 dark:border-fuselage-800"
      style={{ background: '#0b1020' }}
    />
  );
}
