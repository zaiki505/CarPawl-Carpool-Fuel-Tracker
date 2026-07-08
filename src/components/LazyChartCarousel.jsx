import React, { Suspense, lazy } from "react";
import { ErrorBoundary } from "./ui/ErrorBoundary.jsx";

/* Same reasoning as LazyChart.jsx: Recharts is heavy, keep it out of the
   initial bundle and load it only when the dashboard actually renders. */
const ChartCarouselInner = lazy(() =>
  import("./charts/ChartCarousel.jsx").then((m) => ({ default: m.ChartCarousel }))
);

// A bad entry shouldn't blank the whole dashboard, instead it degrades to just this card.
const CHART_CRASH_FALLBACK = (
  <div className="carousel-chart-empty">
    <div className="carousel-chart-empty__emoji">📉</div>
    <p>Couldn't draw your charts this time. Try reopening the app.</p>
  </div>
);

export function ChartCarousel(props) {
  return (
    <ErrorBoundary fallback={CHART_CRASH_FALLBACK}>
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
    </ErrorBoundary>
  );
}
