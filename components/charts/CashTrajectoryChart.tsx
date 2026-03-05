"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  Label,
  ResponsiveContainer,
} from "recharts";
import type { ProjectedPoint } from "@/lib/analytics";

interface Props {
  data: ProjectedPoint[];
}

function formatY(value: number): string {
  if (Math.abs(value) >= 1000000) return `€${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `€${(value / 1000).toFixed(1)}k`;
  return `€${value}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
      <p className="font-semibold text-slate-200 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatY(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function CashTrajectoryChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No data yet — upload a CSV to see your cash trajectory
      </div>
    );
  }

  // Find the peak historical balance (exclude projected points and zero values)
  const historical = data.filter((d) => !d.isProjected && d.balance > 0);
  const peak =
    historical.length > 0
      ? historical.reduce(
          (max, p) => (p.balance > max.balance ? p : max),
          historical[0]
        )
      : null;

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
          <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" />

          {/* Historical balance area */}
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#balanceGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
            name="Cash Balance"
          />

          {/* Projected best case */}
          <Area
            type="monotone"
            dataKey="bestCase"
            stroke="#22c55e"
            strokeWidth={1}
            strokeDasharray="4 2"
            fill="none"
            dot={false}
            name="Best Case"
          />

          {/* Projected worst case */}
          <Area
            type="monotone"
            dataKey="worstCase"
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="4 2"
            fill="none"
            dot={false}
            name="Worst Case"
          />

          {/* Peak cash annotation */}
          {peak && (
            <ReferenceDot
              x={peak.label}
              y={peak.balance}
              r={5}
              fill="#60a5fa"
              stroke="#0f172a"
              strokeWidth={2}
            >
              <Label
                value={`Peak ${formatY(peak.balance)}`}
                position="top"
                fill="#93c5fd"
                fontSize={11}
                fontWeight={600}
                offset={8}
              />
            </ReferenceDot>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
