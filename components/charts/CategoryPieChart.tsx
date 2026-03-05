"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CategorySplit } from "@/lib/types";

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#a855f7",
  "#84cc16",
  "#f59e0b",
  "#6366f1",
];

interface Props {
  splits: CategorySplit[];
  title?: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { percentage: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
      <p className="font-semibold text-slate-200">{p.name}</p>
      <p className="text-slate-400">
        €{p.value.toLocaleString()} — {p.payload.percentage.toFixed(1)}%
      </p>
    </div>
  );
}

export default function CategoryPieChart({ splits, title }: Props) {
  if (!splits || splits.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No category data available
      </div>
    );
  }

  const data = splits
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="w-full">
      {title && (
        <p className="text-sm font-medium text-slate-400 mb-3">{title}</p>
      )}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="70%"
              paddingAngle={2}
            >
              {data.map((_, idx) => (
                <Cell
                  key={idx}
                  fill={COLORS[idx % COLORS.length]}
                  opacity={0.85}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
