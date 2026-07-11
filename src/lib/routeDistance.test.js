import { describe, it, expect, vi, afterEach } from "vitest";
import { routeDistanceKm, RouteDistanceError } from "./routeDistance.js";

/* Coverage for the #6 A->B distance lookup. fetch is mocked so no real network
   hits Nominatim/OSRM; the calls fire in a fixed order (from geocode, to
   geocode, then OSRM route). */

const origFetch = global.fetch;
afterEach(() => {
  global.fetch = origFetch;
  vi.restoreAllMocks();
});

// Returns responses in call order; each entry is the parsed JSON body (ok:true).
function mockFetch(bodies) {
  let i = 0;
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => bodies[i++] }));
}

const geo = (lat, lon) => [{ lat: String(lat), lon: String(lon), display_name: "Place" }];

describe("routeDistanceKm", () => {
  it("geocodes both places then returns the OSRM driving distance in km", async () => {
    mockFetch([geo(3.15, 101.71), geo(3.07, 101.52), { routes: [{ distance: 25000 }] }]);
    const r = await routeDistanceKm("KLCC", "Shah Alam");
    expect(r.km).toBeCloseTo(25);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("passes lon,lat pairs to OSRM in the right order", async () => {
    mockFetch([geo(3.15, 101.71), geo(3.07, 101.52), { routes: [{ distance: 1000 }] }]);
    await routeDistanceKm("A", "B");
    const osrmUrl = global.fetch.mock.calls[2][0];
    expect(osrmUrl).toContain("101.71,3.15;101.52,3.07");
  });

  it("throws a RouteDistanceError when a place is not found", async () => {
    mockFetch([[], geo(1, 1)]);
    await expect(routeDistanceKm("nowhere", "somewhere")).rejects.toBeInstanceOf(
      RouteDistanceError
    );
  });

  it("throws when there is no driving route", async () => {
    mockFetch([geo(1, 1), geo(2, 2), { routes: [] }]);
    await expect(routeDistanceKm("a", "b")).rejects.toThrow(/no driving route/i);
  });

  it("rejects empty input without hitting the network", async () => {
    global.fetch = vi.fn();
    await expect(routeDistanceKm("", "b")).rejects.toBeInstanceOf(RouteDistanceError);
  });
});
