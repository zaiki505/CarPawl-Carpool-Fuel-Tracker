import React from "react";

/* Shared "not enough data yet" filler so every carousel card degrades
   gracefully instead of rendering an empty/flat chart. */
export function EmptyChart({ emoji = "📊", children }) {
  return (
    <div className="carousel-chart-empty">
      <div className="carousel-chart-empty__emoji">{emoji}</div>
      <p>{children}</p>
    </div>
  );
}
