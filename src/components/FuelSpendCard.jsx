import React, { useMemo, useState } from "react";
import { computeFuelSpend, FUEL_PERIODS, NO_BASELINE_MESSAGES } from "../lib/fuelSpend.js";
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
  // Fresh no-baseline message each page load, stable across re-renders (#12).
  const [funMsg] = useState(
    () => NO_BASELINE_MESSAGES[Math.floor(Math.random() * NO_BASELINE_MESSAGES.length)]
  );

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
  const curPeriod = FUEL_PERIODS.find((p) => p.value === period) || FUEL_PERIODS[0];

  return (
    <div className="stat-card stat-card--accent stat-card--wide fuel-spend-card">
      <div className="fuel-spend-card__head">
        <span className="stat-card__label">
          <Fuel size={13} /> Total Fuel Spend
        </span>
        <Segment value={period} onChange={setPeriod} options={FUEL_PERIODS} />
        {/* Small screens: one compact pill that cycles through the periods.
            The flanking chevrons hint that tapping advances it (#10). */}
        <button
          type="button"
          className="period-cycle"
          onClick={() => {
            const i = FUEL_PERIODS.findIndex((p) => p.value === period);
            setPeriod(FUEL_PERIODS[(i + 1) % FUEL_PERIODS.length].value);
          }}
          aria-label={`Period: ${curPeriod.label}. Tap to change.`}
        >
          <span className="period-cycle__chev period-cycle__chev--l" aria-hidden="true" />
          {curPeriod.label}
          <span className="period-cycle__chev period-cycle__chev--r" aria-hidden="true" />
        </button>
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
        ) : period === "all" ? (
          // "All Time" has no possible previous period to diff against - that's
          // structural, not "no history yet", so it gets its own framing
          // instead of the new-user fun message (which would be misleading for
          // someone with years of fill-ups logged).
          <span className="faint" style={{ fontStyle: "italic" }}>
            Since your very first refuel.
          </span>
        ) : (
          <span className="faint" style={{ fontStyle: "italic" }}>
            {funMsg}
          </span>
        )}
      </div>
    </div>
  );
}
