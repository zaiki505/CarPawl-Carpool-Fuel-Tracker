import React from "react";

/* Minimal loading placeholder shown while the first Dexie query resolves.
   Replaces a blank flash with a small "loading" line, so a cold start (or a
   slow IndexedDB open) reads as "still loading" instead of "broken". */
export function ScreenLoading() {
  return (
    <div className="app-shell" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <span className="faint" style={{ fontSize: "0.8rem" }}>loading…</span>
    </div>
  );
}
