import React, { Suspense, lazy } from "react";

/* Same reasoning as LazyChart.jsx: Recharts is heavy, keep it out of the
   initial bundle and load it only when the dashboard actually renders. */
const ChartCarouselInner = lazy(() =>
  import("./charts/ChartCarousel.jsx").then((m) => ({ default: m.ChartCarousel }))
);

export function ChartCarousel(props) {
  return (
    <Suspense
      fallback={
        <div className="chart-card" style={{ display: "grid", placeItems: "center", height: 190 }}>
          <span className="faint" style={{ fontSize: "0.8rem" }}>
            drawing your charts…
          </span>
        </div>
      }
    >
      <ChartCarouselInner {...props} />
    </Suspense>
  );
}
