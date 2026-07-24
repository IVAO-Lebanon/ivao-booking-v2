import { useEffect, useState } from 'react';
import { airlineLogoUrl } from '../lib/branding';

/**
 * Airline logo for a flight number's ICAO prefix, on a white card so the
 * (often transparent / dark) PNGs stay legible in dark mode. Renders nothing
 * if there's no logo or it fails to load (no empty box).
 */
export function AirlineLogo({ flightNumber, className = 'h-5' }: { flightNumber?: string | null; className?: string }) {
  const url = airlineLogoUrl(flightNumber);
  const [ok, setOk] = useState(true);
  // Reset when the flight number changes.
  useEffect(() => setOk(true), [url]);
  if (!url || !ok) return null;
  return (
    <span className="inline-flex items-center rounded bg-white px-1 py-0.5 shadow-sm ring-1 ring-black/5">
      <img src={url} alt="" className={`${className} w-auto object-contain`} onError={() => setOk(false)} />
    </span>
  );
}
