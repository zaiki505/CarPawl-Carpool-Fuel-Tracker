/* Point A -> point B driving distance (#6), via free, keyless OpenStreetMap
   services: Nominatim geocodes each place name to coordinates, then OSRM
   returns the driving-route distance between them. No API key or account is
   needed - both are community services with fair-use limits, so this is meant
   for the occasional "how far was this trip?" lookup, not bulk use. Returns
   kilometres. Every failure surfaces as a RouteDistanceError with a message
   that's safe to show the user directly. */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

export class RouteDistanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "RouteDistanceError";
  }
}

/** Resolve a place name to { lat, lon, label } via Nominatim (best match). */
export async function geocodePlace(query) {
  const q = String(query || "").trim();
  if (!q) throw new RouteDistanceError("Enter a place.");
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new RouteDistanceError("No connection - can't look that place up.");
  }
  if (!res.ok) throw new RouteDistanceError("Place lookup failed - try again.");
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new RouteDistanceError(`Couldn't find "${q}".`);
  }
  const lat = Number(rows[0].lat);
  const lon = Number(rows[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new RouteDistanceError(`Couldn't find "${q}".`);
  }
  return { lat, lon, label: rows[0].display_name || q };
}

/**
 * Typeahead suggestions for a partial place name (#2). Best-effort: returns an
 * empty list on a short query, no matches, or any network/parse error - it
 * never throws, so a flaky lookup just shows no suggestions.
 * @returns {Promise<Array<{ label: string, lat: number, lon: number }>>}
 */
export async function searchPlaces(query, limit = 5) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({ label: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }))
      .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lon));
  } catch {
    return [];
  }
}

/**
 * Driving distance in km between two already-resolved points.
 * @param {{lat:number, lon:number, label?:string}} from
 * @param {{lat:number, lon:number, label?:string}} to
 * @returns {Promise<{ km:number, from:string, to:string }>}
 */
export async function drivingDistanceKm(from, to) {
  // OSRM wants lon,lat pairs separated by ';'.
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM}/${coords}?overview=false`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new RouteDistanceError("No connection - can't get the route.");
  }
  if (!res.ok) throw new RouteDistanceError("Route lookup failed - try again.");
  const data = await res.json();
  const meters = data?.routes?.[0]?.distance;
  if (!(meters > 0)) {
    throw new RouteDistanceError("No driving route between those places.");
  }
  return { km: meters / 1000, from: from.label || "", to: to.label || "" };
}

/**
 * Driving distance between two place names (A -> B). Geocodes each, then routes.
 * @throws {RouteDistanceError} with a user-facing message on any failure.
 */
export async function routeDistanceKm(fromText, toText) {
  const [from, to] = await Promise.all([geocodePlace(fromText), geocodePlace(toText)]);
  return drivingDistanceKm(from, to);
}
