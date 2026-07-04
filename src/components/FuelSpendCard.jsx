import React, { useMemo, useState } from "react";
import { computeFuelSpend, FUEL_PERIODS } from "../lib/fuelSpend.js";
import { share } from "../lib/calc.js";
import { ME } from "../lib/identity.js";
import { formatMoney } from "../lib/format.js";
import { Segment } from "./ui/Primitives.jsx";
import { TrendingUp, TrendingDown, Fuel } from "./ui/Icons.jsx";

/* Dashboard fuel-spend card. Period toggle (week / month / all), user gross spend split into
   driver vs rider, the group (owned) total, and a trend vs the previous period
   with a message when there's no baseline. */
export function FuelSpendCard({ entries, groupOwnedMap }) {
  const [period, setPeriod] = useState("month");

  const result = useMemo(
    () =>
      computeFuelSpend({
        trips: entries || [],
        isDriver: (e) => groupOwnedMap.get(e.groupId) === true,
        riderSplit: (e) => share(e, ME),
        fuelCost: (e) => e.totalCost,
        period,
      }),
    [entries, groupOwnedMap, period]
  );

  const { yourSpend, yourSpendBreakdown, groupTotal, trend } = result;
  const up = trend.direction === "up";

  return (
    <div className="stat-card stat-card--accent stat-card--wide fuel-spend-card">
      <div className="fuel-spend-card__head">
        <span className="stat-card__label">
          <Fuel size={13} /> Total Fuel Spend
        </span>
        <Segment value={period} onChange={setPeriod} options={FUEL_PERIODS} />
      </div>

      <span className="stat-card__value">{formatMoney(yourSpend)}</span>

      <div className="fuel-spend-card__break">
        <span>
          Drove <strong>{formatMoney(yourSpendBreakdown.asDriver)}</strong>
        </span>
        <span>
          Rode <strong>{formatMoney(yourSpendBreakdown.asRider)}</strong>
        </span>
      </div>

      <div className="fuel-spend-card__foot">
        {trend.percentChange != null ? (
          <span className={"fuel-spend-card__trend " + (up ? "neg" : "pos")}>
            {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(trend.percentChange)}% vs last{" "}
            {period === "week" ? "week" : "month"}
          </span>
        ) : (
          <span className="faint" style={{ fontStyle: "italic" }}>
            {trend.message}
          </span>
        )}
      </div>
    </div>
  );
}
