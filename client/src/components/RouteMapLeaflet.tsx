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

    const arc = greatCircle(dep, arr, 256);
    // Soft glow under the planned route (faint, flowing dashed line), plus a solid
    // "flown" trail that grows behind the aircraft to show progress along the path.
    L.polyline(arc, { color: '#1342E4', weight: 9, opacity: 0.14, lineCap: 'round' }).addTo(map);
    const line = L.polyline(arc, { color: '#9DB8E0', weight: 2.5, opacity: 0.85, dashArray: '1 9', lineCap: 'round', className: 'rm-flow' }).addTo(map);
    const flown = L.polyline([], { color: '#335CEE', weight: 3.5, opacity: 0.95, lineCap: 'round' }).addTo(map);

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
      const HW = 56, HH = 38; // half the plane image size (112 x 76)
      plane = document.createElement('img');
      plane.src = liveryUrl;
      // NOTE: no CSS `filter` (drop-shadow) — a filtered layer gets snapped to whole
      // device pixels, which shows as vibration when the plane creeps sub-pixel per
      // frame (i.e. when zoomed out). Plain transforms stay sub-pixel smooth.
      Object.assign(plane.style, {
        position: 'absolute', left: '0', top: '0', width: '112px', height: '76px',
        objectFit: 'contain', transformOrigin: 'center', pointerEvents: 'none', zIndex: '500',
        willChange: 'transform, opacity', backfaceVisibility: 'hidden', opacity: '0',
      });
      map.getContainer().appendChild(plane);
      let ready = false;
      plane.onload = () => { ready = true; };

      const DURATION = 22000; // one dep→arr cruise, then loops seamlessly
      const FADE = 0.06; // fraction of the loop faded in/out to hide the loop seam
      const MIN = 0.52, MAX = 0.95; // scale: small on the ground, largest at cruise
      const east = arr.lon > dep.lon;
      const sx = east ? -1 : 1;

      // The aircraft flies a single CONTINUOUS quadratic Bézier (3 screen anchors),
      // NOT the 256 discrete arc samples. A smooth parametric curve with an analytic
      // tangent has no per-point stepping, so it stays smooth at any zoom — including
      // zoomed way out where the plane creeps only a fraction of a pixel per frame.
      // The control point is placed so the curve passes through the real mid-arc point,
      // giving it the same bow as the drawn great-circle line.
      const midIdx = Math.floor((N - 1) / 2);
      let p0x = 0, p0y = 0, p1x = 0, p1y = 0, p2x = 0, p2y = 0;
      const recompute = () => {
        const a = map.latLngToContainerPoint([arc[0][0], arc[0][1]]);
        const b = map.latLngToContainerPoint([arc[N - 1][0], arc[N - 1][1]]);
        const m = map.latLngToContainerPoint([arc[midIdx][0], arc[midIdx][1]]);
        p0x = a.x; p0y = a.y; p2x = b.x; p2y = b.y;
        p1x = 2 * m.x - (p0x + p2x) / 2;
        p1y = 2 * m.y - (p0y + p2y) / 2;
      };
      recompute();
      map.on('move zoom resize', recompute);

      let lastI = -1;
      const startT = performance.now();

      const tick = (now: number) => {
        if (plane) {
          const t = ((now - startT) % DURATION) / DURATION; // 0→1 constant-speed cruise
          const mt = 1 - t;
          // Position on the Bézier + its analytic tangent (for a jitter-free heading).
          const cx = mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x;
          const cy = mt * mt * p0y + 2 * mt * t * p1y + t * t * p2y;
          const tanx = 2 * mt * (p1x - p0x) + 2 * t * (p2x - p1x);
          const tany = 2 * mt * (p1y - p0y) + 2 * t * (p2y - p1y);
          const deg = (Math.atan2(tany, tanx) * 180) / Math.PI;
          const rot = east ? deg : deg + 180;

          // Grow the flown trail along the real arc (updated only on segment change).
          const i = Math.min(N - 1, Math.floor(t * (N - 1)));
          if (i !== lastI) {
            flown.setLatLngs(arc.slice(0, i + 1) as [number, number][]);
            lastI = i;
          }

          const s = MIN + (MAX - MIN) * Math.sin(t * Math.PI); // climb · cruise · descend
          const fade = t < FADE ? t / FADE : t > 1 - FADE ? (1 - t) / FADE : 1;
          plane.style.opacity = ready ? String(fade) : '0';
          plane.style.transform =
            `translate3d(${cx - HW}px, ${cy - HH}px, 0) rotate(${rot}deg) scale(${s}) scaleX(${sx})`;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      // Re-project once the modal has settled to its final size.
      setTimeout(recompute, 200);
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
