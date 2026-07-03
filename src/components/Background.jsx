import React from "react";

/* Fixed aurora + film-grain backdrop that sits behind all app content.
   Mirrors the source portfolio's hero background (drifting purple/pink/blue
   blobs + faint SVG grain). Purely decorative, pointer-events: none. */
export function Background() {
  return (
    <>
      <div className="app-aurora" aria-hidden="true">
        <div className="app-aurora__pink" />
      </div>
      <div className="app-grain" aria-hidden="true" />
    </>
  );
}
