"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MonthlySummary } from "@/lib/types";
import { formatMonth } from "@/lib/analytics";

export type BurnViewMode = "all" | "burn" | "inflows" | "net" | "avg";

interface Props {
  summaries: MonthlySummary[];
  viewMode?: BurnViewMode;
  windowMonths?: number;
}

function formatY(value: number): string {
  if (Math.abs(value) >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `€${(value / 1000).toFixed(0)}k`;
  return `€${value}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; fill?: string; stroke?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
      <p className="font-semibold text-slate-200 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill ?? p.stroke }}>
          {p.name}: {formatY(Math.abs(p.value))}
        </p>
      ))}
    </div>
  );
}

export default function BurnBarChart({ summaries, viewMode = "all", windowMonths = 6 }: Props) {
  if (!summaries || summaries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No data yet — upload a CSV to see your burn chart
      </div>
    );
  }

  const rawSummaries = summaries.slice(-24);
  const data = rawSummaries.map((s, i) => {
    const windowSlice = rawSummaries.slice(Math.max(0, i - windowMonths + 1), i + 1);
    const avgGrossBurn =
      windowSlice.reduce((sum, ws) => sum + ws.grossBurn, 0) / windowSlice.length;
    return {
      label: formatMonth(s.month),
      grossBurn: -s.grossBurn, // negative so bars render below axis
      inflows: s.inflows,
      netBurn: s.netBurn,
      rollingAvgBurn: -avgGrossBurn, // negative so line follows burn bars below axis
    };
  });

  const showBurn = viewMode === "all" || viewMode === "burn" || viewMode === "avg";
  const showInflows = viewMode === "all" || viewMode === "inflows";
  const showNet = viewMode === "all" || viewMode === "net";
  const showAvg = viewMode === "avg";

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatY}
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
          <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />

          {showBurn && (
            <Bar
              dataKey="grossBurn"
              name="Gross Burn"
              fill="#ef4444"
              opacity={0.8}
              radius={[2, 2, 0, 0]}
            />
          )}
          {showInflows && (
            <Bar
              dataKey="inflows"
              name="Inflows"
              fill="#22c55e"
              opacity={0.8}
              radius={[2, 2, 0, 0]}
            />
          )}
          {showNet && (
            <Line
              type="monotone"
              dataKey="netBurn"
              name="Net Burn"
              stroke="#eab308"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
          {showAvg && (
            <Line
              type="monotone"
              dataKey="rollingAvgBurn"
              name={`Avg Burn (${windowMonths}mo)`}
              stroke="#f97316"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              strokeDasharray="6 3"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
