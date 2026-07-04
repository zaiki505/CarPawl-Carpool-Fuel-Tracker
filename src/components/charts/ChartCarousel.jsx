import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  monthlyCostTrend,
  monthVsLastMonth,
  costByPerson,
  refuelFrequency,
} from "../../lib/dashboardCharts.js";
import { Select } from "../ui/Select.jsx";
import { MonthlyCostTrendChart } from "./MonthlyCostTrendChart.jsx";
import { MonthVsLastMonthChart } from "./MonthVsLastMonthChart.jsx";
import { CostByPersonChart } from "./CostByPersonChart.jsx";
import { RefuelFrequencyChart } from "./RefuelFrequencyChart.jsx";

const CARDS = [
  { key: "trend", title: "Monthly cost trend", Chart: MonthlyCostTrendChart },
  { key: "mvl", title: "This month vs last month", Chart: MonthVsLastMonthChart },
  { key: "person", title: "Cost by person", Chart: CostByPersonChart },
  { key: "freq", title: "Refuel frequency", Chart: RefuelFrequencyChart },
];

/* Swipeable 4-card chart carousel (§18) - replaces the old per-vehicle
   efficiency section. One shared vehicle filter feeds all 4 cards; each card
   is dumb (data in, chart out), computed by lib/dashboardCharts.js. */
export function ChartCarousel({ ownedGroups, entriesByGroup, peopleMap }) {
  const [vehicle, setVehicle] = useState("all");
  const [active, setActive] = useState(0);
  const trackRef = useRef(null);

  const vehicleOptions = [
    { value: "all", label: "All vehicles" },
    ...ownedGroups.map((g) => ({ value: g.id, label: g.name })),
  ];

  const scopedEntries = useMemo(() => {
    const groups = vehicle === "all" ? ownedGroups : ownedGroups.filter((g) => g.id === vehicle);
    return groups.flatMap((g) => entriesByGroup[g.id] || []);
  }, [ownedGroups, entriesByGroup, vehicle]);

  const datasets = useMemo(
    () => ({
      trend: monthlyCostTrend(scopedEntries),
      mvl: monthVsLastMonth(scopedEntries),
      person: costByPerson(scopedEntries, peopleMap),
      freq: refuelFrequency(scopedEntries),
    }),
    [scopedEntries, peopleMap]
  );

  // Track which card is centered so the dots stay in sync with manual swipes.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cardW = el.firstChild ? el.firstChild.getBoundingClientRect().width + 12 : 1;
        setActive(Math.round(el.scrollLeft / cardW));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  function goTo(i) {
    const el = trackRef.current;
    if (!el) return;
    const cardW = el.firstChild ? el.firstChild.getBoundingClientRect().width + 12 : 0;
    el.scrollTo({ left: cardW * i, behavior: "smooth" });
  }

  return (
    <div className="chart-carousel">
      <div className="chart-carousel__head">
        <span className="chart-block__title" style={{ marginBottom: 0 }}>
          Your numbers
        </span>
        {ownedGroups.length > 1 && (
          <div className="chart-carousel__filter">
            <Select value={vehicle} onChange={setVehicle} options={vehicleOptions} />
          </div>
        )}
      </div>

      <div className="chart-carousel__track" ref={trackRef}>
        {CARDS.map(({ key, title, Chart }) => (
          <div className="chart-carousel__card" key={key}>
            <div className="chart-carousel__card-title">{title}</div>
            <Chart data={datasets[key]} />
          </div>
        ))}
      </div>

      <div className="chart-carousel__dots" role="tablist" aria-label="Chart pages">
        {CARDS.map((c, i) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active === i}
            aria-label={c.title}
            className={"chart-carousel__dot" + (active === i ? " is-active" : "")}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}
