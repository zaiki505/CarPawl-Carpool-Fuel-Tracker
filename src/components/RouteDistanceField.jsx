import React, { useState } from "react";
import { routeDistanceKm, RouteDistanceError } from "../lib/routeDistance.js";
import { MapPin, ChevronDown } from "./ui/Icons.jsx";
import { haptic } from "../lib/haptics.js";

/* "Work out the distance from a route" helper for the Fuel step (#6). Type a
   start and end place; it geocodes both and fills the trip distance in above.
   Collapsed by default so it never gets in the way of typing a distance by
   hand. Uses free OpenStreetMap services (see lib/routeDistance.js). */
export function RouteDistanceField({ onDistance }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultKm, setResultKm] = useState(null);

  async function calc() {
    setError("");
    setResultKm(null);
    if (!from.trim() || !to.trim()) {
      setError("Enter both a start and an end place.");
      return;
    }
    setBusy(true);
    try {
      const r = await routeDistanceKm(from, to);
      const km = Math.round(r.km * 10) / 10;
      setResultKm(km);
      onDistance(km);
      haptic("success");
    } catch (e) {
      setError(e instanceof RouteDistanceError ? e.message : "Couldn't work out the distance.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="route-toggle" onClick={() => setOpen(true)}>
        <MapPin size={14} /> Work out distance from a route
      </button>
    );
  }

  return (
    <div className="route-calc">
      <div className="route-calc__head">
        <MapPin size={14} />
        <span>Route distance (A &rarr; B)</span>
        <button
          type="button"
          className="route-calc__close"
          onClick={() => setOpen(false)}
          aria-label="Close route distance"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <input
        type="text"
        placeholder="From (e.g. KLCC, Kuala Lumpur)"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <input
        type="text"
        placeholder="To (e.g. Shah Alam)"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            calc();
          }
        }}
      />
      <button type="button" className="action-btn route-calc__go" onClick={calc} disabled={busy}>
        {busy ? "Finding route…" : "Get distance"}
      </button>
      {error && <p className="field-hint route-calc__error">{error}</p>}
      {resultKm != null && !error && (
        <p className="field-hint route-calc__ok">{resultKm} km driving - filled in above.</p>
      )}
      <p className="field-hint route-calc__note">
        Uses OpenStreetMap - the place names you type are sent to its free lookup service.
      </p>
    </div>
  );
}
