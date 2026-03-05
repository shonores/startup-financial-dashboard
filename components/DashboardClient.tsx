"use client";

import { useState } from "react";
import KPICard from "@/components/KPICard";
import CashTrajectoryChart from "@/components/charts/CashTrajectoryChart";
import BurnBarChart, { type BurnViewMode } from "@/components/charts/BurnBarChart";
import {
  computeRunwayMetrics,
  buildCashTrajectory,
  formatCurrency,
  runwayColor,
} from "@/lib/analytics";
import type { MonthlySummary, Vendor, UploadLog } from "@/lib/schema";
import Link from "next/link";

interface Props {
  summaries: MonthlySummary[];
  vendors: Vendor[];
  lastUpload: UploadLog | null;
}

const WINDOW_OPTIONS = [3, 6, 9, 12, 18, 24] as const;

const BURN_VIEWS: { mode: BurnViewMode; label: string; description: string }[] = [
  { mode: "all", label: "All", description: "Burn + Inflows + Net" },
  { mode: "burn", label: "Burn", description: "Gross burn only" },
  { mode: "inflows", label: "Inflows", description: "Inflows only" },
  { mode: "net", label: "Net", description: "Net burn trend" },
  { mode: "avg", label: "Avg", description: "Burn bars + rolling average line" },
];

export default function DashboardClient({ summaries, vendors, lastUpload }: Props) {
  const [windowMonths, setWindowMonths] = useState(6);
  const [burnViewMode, setBurnViewMode] = useState<BurnViewMode>("all");

  const hasData = summaries.length > 0;
  const metrics = hasData
    ? computeRunwayMetrics(summaries, vendors, windowMonths)
    : null;
  const trajectory = buildCashTrajectory(summaries, 18, windowMonths);

  function runwayBadge(months: number): { label: string; className: string } {
    if (months > 18) return { label: "Healthy", className: "badge-green" };
    if (months >= 12) return { label: "Watch", className: "badge-yellow" };
    return { label: "Critical", className: "badge-red" };
  }

  function burnTrendBadge(trend: "up" | "down" | "flat") {
    if (trend === "up") return { label: "↑ Increasing", className: "badge-red" };
    if (trend === "down") return { label: "↓ Decreasing", className: "badge-green" };
    return { label: "→ Stable", className: "badge-blue" };
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          {lastUpload && (
            <p className="text-slate-500 text-sm mt-1">
              Last updated:{" "}
              {new Date(lastUpload.uploadedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              · {lastUpload.monthsCovered}
            </p>
          )}
        </div>
        {!hasData && (
          <Link href="/upload" className="btn-primary text-sm">
            Upload CSV
          </Link>
        )}
      </div>

      {!hasData ? (
        <div className="card text-center py-16">
          <p className="text-slate-400 text-lg font-medium">No data yet</p>
          <p className="text-slate-500 text-sm mt-2 mb-6">
            Upload a Revolut Business CSV export to get started.
          </p>
          <Link href="/upload" className="btn-primary">
            Upload Your First CSV
          </Link>
        </div>
      ) : (
        <>
          {/* Rolling window selector */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">
              Rolling window
            </span>
            <div className="flex gap-1">
              {WINDOW_OPTIONS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWindowMonths(w)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    windowMonths === w
                      ? "bg-blue-600 text-white font-semibold"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {w}mo
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-600">
              — used for avg burn & projections
            </span>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <KPICard
              title="Current Cash"
              value={formatCurrency(metrics!.currentCash)}
              subtitle="Latest closing balance"
            />
            <KPICard
              title="Runway"
              value={
                metrics!.runwayMonths === Infinity || metrics!.runwayMonths > 120
                  ? "120+ mo"
                  : `${metrics!.runwayMonths.toFixed(1)} mo`
              }
              subtitle={`At current ${windowMonths}-month avg burn`}
              valueClassName={runwayColor(metrics!.runwayMonths)}
              badge={runwayBadge(metrics!.runwayMonths)}
            />
            <KPICard
              title="Avg Monthly Burn"
              value={formatCurrency(metrics!.avgMonthlyBurn)}
              subtitle={`${windowMonths}-month rolling average`}
              badge={burnTrendBadge(metrics!.burnTrend)}
            />
            <KPICard
              title="Zero Cash Date"
              value={metrics!.zeroCashDate}
              subtitle="Projected at current burn"
              valueClassName={
                metrics!.runwayMonths < 6 ? "text-red-400" : "text-slate-100"
              }
            />
            <KPICard
              title="Fixed Recurring"
              value={formatCurrency(metrics!.fixedRecurring)}
              subtitle="Recurring vendor commitments/mo"
            />
            <KPICard
              title="Biggest Spend"
              value={metrics!.biggestVendorAlias}
              subtitle={`${formatCurrency(metrics!.biggestVendorSpend)} total`}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cash trajectory */}
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">
                Cash Trajectory
              </h2>
              <CashTrajectoryChart data={trajectory} />
              <p className="text-xs text-slate-600 mt-3">
                Projection uses {windowMonths}-month avg burn. Dashed = best/worst case.
              </p>
            </div>

            {/* Burn chart with view toggle */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-300">
                  Monthly Financials
                </h2>
                <div className="flex gap-1">
                  {BURN_VIEWS.map((v) => (
                    <button
                      key={v.mode}
                      title={v.description}
                      onClick={() => setBurnViewMode(v.mode)}
                      className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                        burnViewMode === v.mode
                          ? "bg-slate-600 text-slate-100 font-semibold"
                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <BurnBarChart summaries={summaries} viewMode={burnViewMode} windowMonths={windowMonths} />
              <p className="text-xs text-slate-600 mt-3">
                {burnViewMode === "all" && "Red = gross burn · Green = inflows · Yellow line = net burn"}
                {burnViewMode === "burn" && "Gross outflows only — all spending before inflows"}
                {burnViewMode === "inflows" && "Revenue and inflows only"}
                {burnViewMode === "net" && "Net burn = gross burn minus inflows"}
                {burnViewMode === "avg" && `Red bars = monthly burn · Orange dashed = ${windowMonths}-month rolling average`}
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
