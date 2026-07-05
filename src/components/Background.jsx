import React from "react";

/* Fixed aurora + film-grain backdrop that sits behind all app content. */
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
