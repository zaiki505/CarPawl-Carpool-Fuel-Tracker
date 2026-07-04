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
import { formatMoney, formatMoneyShort } from "../../lib/format.js";
import { EmptyChart } from "./EmptyChart.jsx";

/* Card 1: last 6 months of total fuel cost, one line, one accent color. */
export function MonthlyCostTrendChart({ data }) {
  if (!data.some((d) => d.cost > 0)) {
    return <EmptyChart>Log a couple of refuels to start plotting your monthly cost here.</EmptyChart>;
  }
  return (
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
          width={44}
          tickFormatter={(v) => formatMoneyShort(v)}
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
          formatter={(v) => [formatMoney(v), "Cost"]}
        />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="var(--highlight)"
          strokeWidth={2.4}
          dot={{ r: 3, fill: "var(--highlight)", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "var(--accent-soft)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
