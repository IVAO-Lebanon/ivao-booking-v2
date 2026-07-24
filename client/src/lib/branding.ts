// Division-agnostic branding helpers. The division comes from the server (env),
// never hardcoded — so the app works for any IVAO division.

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** Official IVAO division logo (SVG) for a division id, e.g. "LB" → …/LB.svg. */
export function divisionLogoUrl(division?: string | null): string {
  const d = (division || '').trim().toUpperCase();
  return d ? `https://www.ivao.aero/publrelat/branding/svg_logos/${d}.svg` : '';
}

/** The 3-letter airline ICAO from a flight number/callsign (e.g. "DLH743" → "DLH"). */
export function airlineCode(flightNumber?: string | null): string {
  const m = (flightNumber || '').toUpperCase().match(/^([A-Z]{3})/);
  return m ? m[1] : '';
}

/** Airline logo (served from the API) for a flight number's 3-letter ICAO prefix. */
export function airlineLogoUrl(flightNumber?: string | null): string {
  const code = airlineCode(flightNumber);
  return code ? `${API_BASE}/airline-logo/${code}.png` : '';
}

/** MTL livery render (served via the API proxy) for a Whazzup textureId. */
export function textureImageUrl(textureId?: number | null): string {
  return textureId ? `${API_BASE}/ref/texture/${textureId}/image` : '';
}

export const AUTHOR = {
  name: 'Ahmad Dayeh',
  url: 'https://www.ivao.aero/Member.aspx?Id=588679',
};
