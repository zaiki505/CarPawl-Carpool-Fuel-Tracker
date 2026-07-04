import React from "react";
import { formatMoney } from "../../lib/format.js";
import { TrendingUp, TrendingDown } from "../ui/Icons.jsx";
import { EmptyChart } from "./EmptyChart.jsx";

/* Card 2: two-bar comparison + a large, instantly-readable % change. Hand-rolled
   (not Recharts) - two bars and a number don't need a charting library. */
export function MonthVsLastMonthChart({ data }) {
  const { thisMonth, lastMonth, pctChange } = data;
  if (thisMonth === 0 && lastMonth === 0) {
    return <EmptyChart>No refuels this month or last - nothing to compare yet.</EmptyChart>;
  }
  const max = Math.max(thisMonth, lastMonth, 0.01);
  const up = pctChange != null && pctChange > 0;

  return (
    <div className="mvl-chart">
      <div className="mvl-chart__bars">
        <div className="mvl-chart__col">
          <span className="mvl-chart__value">{formatMoney(lastMonth)}</span>
          <div className="mvl-chart__track">
            <div className="mvl-chart__bar" style={{ height: `${(lastMonth / max) * 100}%` }} />
          </div>
          <span className="mvl-chart__label">Last month</span>
        </div>
        <div className="mvl-chart__col mvl-chart__col--accent">
          <span className="mvl-chart__value mvl-chart__value--big">{formatMoney(thisMonth)}</span>
          <div className="mvl-chart__track">
            <div
              className="mvl-chart__bar mvl-chart__bar--accent"
              style={{ height: `${(thisMonth / max) * 100}%` }}
            />
          </div>
          <span className="mvl-chart__label">This month</span>
        </div>
      </div>
      {pctChange != null ? (
        <div className={"mvl-chart__pct " + (up ? "neg" : "pos")}>
          {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          {Math.abs(pctChange)}% vs last month
        </div>
      ) : (
        <p className="faint" style={{ fontSize: "0.78rem", fontStyle: "italic", margin: "0.6rem 0 0" }}>
          No spend last month to compare against.
        </p>
      )}
    </div>
  );
}
