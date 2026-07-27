// Division-agnostic branding helpers. The division comes from the server (env),
// never hardcoded — so the app works for any IVAO division.

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** Product/brand name shown across the app (header, login, titles, emails). */
export const APP_NAME = 'BYBLOS';
/** Short descriptor used under the wordmark / in taglines. */
export const APP_TAGLINE = 'Flight Booking System';
/** Operating division, spelled out (used in taglines/footers). */
export const APP_OPERATOR = 'IVAO Lebanon';

/** BYBLOS app icon (white cedar on brand navy) as an inline SVG data URI — used
 * for the browser favicon. Matches the "icon only" rendition of the Final 2A logo. */
export function faviconDataUri(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" rx="22" fill="#0D2C99"/>' +
    '<g fill="#ffffff" transform="translate(0,4)">' +
    '<rect x="46" y="80" width="8" height="12" rx="2"/>' +
    '<path d="M16 78 L84 78 L50 56 Z"/>' +
    '<path d="M24 58 L76 58 L50 36 Z"/>' +
    '<path d="M32 40 L68 40 L50 16 Z"/>' +
    '</g></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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
