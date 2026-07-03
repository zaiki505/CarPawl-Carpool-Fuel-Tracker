import React, { Suspense, lazy } from "react";

/* Recharts is heavy (~250KB). Load it in its own async chunk so the app shell
   and first paint don't carry it. The chart only appears on the Dashboard, so
   this keeps the initial bundle lean. */
const EfficiencyChartInner = lazy(() =>
  import("./EfficiencyChart.jsx").then((m) => ({ default: m.EfficiencyChart }))
);

export function EfficiencyChart(props) {
  return (
    <Suspense
      fallback={
        <div className="chart-card" style={{ display: "grid", placeItems: "center", height: 190 }}>
          <span className="faint" style={{ fontSize: "0.8rem" }}>
            drawing your chart…
          </span>
        </div>
      }
    >
      <EfficiencyChartInner {...props} />
    </Suspense>
  );
}
