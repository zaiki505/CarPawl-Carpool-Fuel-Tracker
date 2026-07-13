import React, { useEffect, useRef, useState } from "react";
import {
  routeDistanceKm,
  drivingDistanceKm,
  geocodePlace,
  searchPlaces,
  RouteDistanceError,
} from "../lib/routeDistance.js";
import { MapPin, ChevronDown } from "./ui/Icons.jsx";
import { haptic } from "../lib/haptics.js";

/* "Work out the distance from a route" helper for the Fuel step (#6). Type a
   start and end place; it geocodes both and fills the trip distance in above.
   Each field offers live place suggestions as you type (#2). Collapsed by
   default. Uses free OpenStreetMap services (see lib/routeDistance.js). */

// A text field with a debounced Nominatim suggestion dropdown. Picking a
// suggestion stashes its coords so we can route without a second geocode.
function PlaceInput({ text, coords, onText, onPick, placeholder, onSubmit }) {
  const [suggests, setSuggests] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    // A picked value is already resolved - don't keep searching it.
    if (coords) {
      setSuggests([]);
      setOpen(false);
      return;
    }
    const q = text.trim();
    if (q.length < 3) {
      setSuggests([]);
      setOpen(false);
      return;
    }
    // Debounce so we don't hit the free lookup on every keystroke.
    const t = setTimeout(async () => {
      const res = await searchPlaces(q, 5);
      setSuggests(res);
      setOpen(res.length > 0);
    }, 350);
    return () => clearTimeout(t);
  }, [text, coords]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div className="place-input" ref={boxRef}>
      <input
        type="text"
        placeholder={placeholder}
        value={text}
        onChange={(e) => onText(e.target.value)}
        onFocus={() => suggests.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onSubmit?.();
          }
        }}
      />
      {open && (
        <ul className="place-suggests">
          {suggests.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="place-suggest"
                onClick={() => {
                  onPick(s.label, { lat: s.lat, lon: s.lon });
                  setOpen(false);
                }}
              >
                <MapPin size={12} />
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RouteDistanceField({ onDistance }) {
  const [open, setOpen] = useState(false);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultKm, setResultKm] = useState(null);

  // Resolve one endpoint: use the coords picked from a suggestion, else geocode
  // the typed text.
  async function resolve(text, coords) {
    if (coords) return { lat: coords.lat, lon: coords.lon, label: text };
    return geocodePlace(text);
  }

  async function calc() {
    setError("");
    setResultKm(null);
    if (!fromText.trim() || !toText.trim()) {
      setError("Enter both a start and an end place.");
      return;
    }
    setBusy(true);
    try {
      let r;
      if (fromCoords && toCoords) {
        r = await drivingDistanceKm(
          { ...fromCoords, label: fromText },
          { ...toCoords, label: toText }
        );
      } else {
        const [f, t] = await Promise.all([
          resolve(fromText, fromCoords),
          resolve(toText, toCoords),
        ]);
        r = await drivingDistanceKm(f, t);
      }
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
        <MapPin size={14} />
        <span className="route-toggle__label">Work out distance from a route</span>
        <ChevronDown size={16} className="route-toggle__chev" />
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
      <PlaceInput
        text={fromText}
        coords={fromCoords}
        placeholder="From (e.g. KLCC, Kuala Lumpur)"
        onText={(v) => {
          setFromText(v);
          setFromCoords(null);
        }}
        onPick={(label, coords) => {
          setFromText(label);
          setFromCoords(coords);
        }}
        onSubmit={calc}
      />
      <PlaceInput
        text={toText}
        coords={toCoords}
        placeholder="To (e.g. Shah Alam)"
        onText={(v) => {
          setToText(v);
          setToCoords(null);
        }}
        onPick={(label, coords) => {
          setToText(label);
          setToCoords(coords);
        }}
        onSubmit={calc}
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
