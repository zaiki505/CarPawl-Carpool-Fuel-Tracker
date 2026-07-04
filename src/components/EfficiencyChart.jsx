import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { efficiencyTrend } from "../lib/calc.js";
import { formatDateShort, formatKmpl } from "../lib/format.js";
import { EmptyState } from "./ui/Primitives.jsx";

/* Fuel efficiency trend: last 30 days, measured entries only. If a group
   has no measured readings in the window we show a friendly nudge to add a real
   distance/liters next time - never a flat/fake line. */
export function EfficiencyChart({ entries }) {
  const points = efficiencyTrend(entries || []);

  if (points.length === 0) {
    return (
      <EmptyState emoji="📈" title="No efficiency readings yet">
        Add a real trip distance or actual liters on your next fill-up and your
        km/L trend will start plotting here.
      </EmptyState>
    );
  }

  const data = points.map((p) => ({
    ...p,
    label: formatDateShort(p.date),
    eff: Number(p.efficiency.toFixed(2)),
  }));

  return (
    <div className="chart-card">
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            width={38}
            domain={[
              (min) => Math.floor(min - 1),
              (max) => Math.ceil(max + 1),
            ]}
            allowDecimals={false}
            tickFormatter={(v) => String(Math.round(v))}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-menu)",
              border: "1px solid var(--border-accent)",
              borderRadius: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--text-muted)" }}
            formatter={(v) => [formatKmpl(v), "Efficiency"]}
          />
          <Line
            type="monotone"
            dataKey="eff"
            stroke="var(--highlight)"
            strokeWidth={2.4}
            dot={{ r: 3, fill: "var(--highlight)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--accent-soft)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
