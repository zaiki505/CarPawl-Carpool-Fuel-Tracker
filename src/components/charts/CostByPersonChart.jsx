import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "../../lib/format.js";
import { EmptyChart } from "./EmptyChart.jsx";

/* Card 3: horizontal bars, highest contributor first. */
export function CostByPersonChart({ data }) {
  if (!data.length) {
    return <EmptyChart>Add passengers to a refuel to see who's contributed what.</EmptyChart>;
  }
  const top = data.slice(0, 6);
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={64}
          tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
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
        <Bar dataKey="amount" fill="var(--highlight)" radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
