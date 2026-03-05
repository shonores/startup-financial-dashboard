"use client";

import NavBar from "@/components/NavBar";
import ScenarioComparisonChart from "@/components/charts/ScenarioComparisonChart";
import { useEffect, useState } from "react";
import type { MonthlySummary, Scenario } from "@/lib/schema";
import { formatMonth, computeZeroCashDate } from "@/lib/analytics";

interface ScenariosResponse {
  scenarios: Scenario[];
  baseline: {
    avgMonthlyBurn: number;
    currentCash: number;
    runwayMonths: number;
  };
  summaries: MonthlySummary[];
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

const WINDOW_OPTIONS = [3, 6, 9, 12, 18, 24] as const;

function buildProjection(
  summaries: MonthlySummary[],
  baselineBurn: number,
  scenarioBurn: number,
  currentCash: number,
  months = 30
): Array<{ month: string; label: string; baseline: number; scenario: number }> {
  if (summaries.length === 0) return [];

  const sorted = [...summaries].sort((a, b) => a.month.localeCompare(b.month));
  const historical = sorted.slice(-6).map((s) => ({
    month: s.month,
    label: formatMonth(s.month),
    baseline: s.closingBalance ?? 0,
    scenario: s.closingBalance ?? 0,
  }));

  const lastSummary = sorted[sorted.length - 1];
  const lastMonth = lastSummary?.month ?? "";

  let baseBalance = lastSummary?.closingBalance ?? 0;
  let scenarioBalance = currentCash;

  for (let i = 1; i <= months; i++) {
    const [year, mo] = lastMonth.split("-").map(Number);
    const futureDate = new Date(year, mo - 1 + i, 1);
    const futureMonth = futureDate.toISOString().slice(0, 7);

    baseBalance = Math.max(0, baseBalance - baselineBurn);
    scenarioBalance = Math.max(0, scenarioBalance - scenarioBurn);

    historical.push({
      month: futureMonth,
      label: formatMonth(futureMonth),
      baseline: Math.round(baseBalance),
      scenario: Math.round(scenarioBalance),
    });

    if (baseBalance <= 0 && scenarioBalance <= 0) break;
  }

  return historical;
}

export default function ScenariosPage() {
  const [data, setData] = useState<ScenariosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [windowMonths, setWindowMonths] = useState(6);

  // Number inputs (direct values, no sliders)
  const [monthlySavings, setMonthlySavings] = useState(0);
  const [monthlyIncrease, setMonthlyIncrease] = useState(0);
  const [oneTimeCash, setOneTimeCash] = useState(0);
  const [revenueGrowthPct, setRevenueGrowthPct] = useState(0);
  const [scenarioName, setScenarioName] = useState("My Scenario");

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((d: ScenariosResponse) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  // Recompute baseline burn when window changes
  const summaries = data?.summaries ?? [];
  const sorted = [...summaries].sort((a, b) => a.month.localeCompare(b.month));
  const windowSlice = sorted.slice(-windowMonths);
  const baseAvgBurn =
    windowSlice.length > 0
      ? windowSlice.reduce((s, m) => s + m.netBurn, 0) / windowSlice.length
      : data?.baseline.avgMonthlyBurn ?? 0;
  const baseAvgInflows =
    windowSlice.length > 0
      ? windowSlice.reduce((s, m) => s + m.inflows, 0) / windowSlice.length
      : 0;

  const latestSummary = sorted[sorted.length - 1];
  const currentCashBase = latestSummary?.closingBalance ?? 0;
  const currentCash = currentCashBase + oneTimeCash;

  const adjustedInflows = baseAvgInflows * (1 + revenueGrowthPct / 100);
  const adjustedBurn = Math.max(
    0,
    baseAvgBurn + monthlyIncrease - monthlySavings - (adjustedInflows - baseAvgInflows)
  );

  const baseRunway = baseAvgBurn > 0 ? currentCashBase / baseAvgBurn : 999;
  const resultRunway = adjustedBurn > 0 ? currentCash / adjustedBurn : 999;
  const delta = resultRunway - baseRunway;
  const zeroCashDate = computeZeroCashDate(currentCash, adjustedBurn);

  const chartData = buildProjection(
    summaries,
    baseAvgBurn,
    adjustedBurn,
    currentCash,
    30
  );

  async function saveScenario() {
    setSaving(true);
    try {
      await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scenarioName,
          monthlySavings,
          monthlyIncrease,
          oneTimeCash,
          revenueGrowthPct,
        }),
      });
      const r = await fetch("/api/scenarios");
      const d = (await r.json()) as ScenariosResponse;
      setData(d);
    } finally {
      setSaving(false);
    }
  }

  async function deleteScenario(id: number) {
    await fetch(`/api/scenarios?id=${id}`, { method: "DELETE" });
    const r = await fetch("/api/scenarios");
    const d = (await r.json()) as ScenariosResponse;
    setData(d);
  }

  function applyPreset(type: "survival" | "lean" | "bridge") {
    if (type === "survival") {
      setMonthlySavings(Math.round(baseAvgBurn * 0.3));
      setMonthlyIncrease(0);
      setOneTimeCash(0);
      setRevenueGrowthPct(0);
      setScenarioName("Survival Mode");
    } else if (type === "lean") {
      setMonthlySavings(Math.round(baseAvgBurn * 0.15));
      setMonthlyIncrease(0);
      setOneTimeCash(0);
      setRevenueGrowthPct(0);
      setScenarioName("Lean Mode");
    } else {
      setMonthlySavings(0);
      setMonthlyIncrease(0);
      setOneTimeCash(Math.round(currentCashBase * 0.5));
      setRevenueGrowthPct(0);
      setScenarioName("Bridge Round");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Scenario Simulator</h1>
          <p className="text-slate-400 text-sm mt-1">
            Model what-if changes to your runway
          </p>
        </div>

        {/* Rolling window selector */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">
            Avg burn window
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
            Baseline avg burn: <span className="text-slate-400">{formatCurrency(baseAvgBurn)}/mo</span>
          </span>
        </div>

        {!currentCashBase ? (
          <div className="card text-center py-12">
            <p className="text-slate-400">No data yet — upload a CSV first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Controls */}
            <div className="space-y-4">
              {/* Presets */}
              <div className="card">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Presets
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => applyPreset("survival")}
                    className="w-full text-left px-3 py-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 text-sm transition-colors"
                  >
                    Survival Mode — cut 30% of burn
                  </button>
                  <button
                    onClick={() => applyPreset("lean")}
                    className="w-full text-left px-3 py-2 rounded-lg bg-yellow-950 hover:bg-yellow-900 text-yellow-300 text-sm transition-colors"
                  >
                    Lean Mode — cut 15% of burn
                  </button>
                  <button
                    onClick={() => applyPreset("bridge")}
                    className="w-full text-left px-3 py-2 rounded-lg bg-green-950 hover:bg-green-900 text-green-300 text-sm transition-colors"
                  >
                    Bridge Round — inject 50% of cash
                  </button>
                </div>
              </div>

              {/* Number inputs */}
              <div className="card space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                  Parameters
                </p>

                <NumberField
                  label="Monthly Savings"
                  value={monthlySavings}
                  onChange={setMonthlySavings}
                  prefix="€"
                  suffix="/mo"
                  hint="Costs you cut"
                  color="green"
                />
                <NumberField
                  label="Monthly Cost Increase"
                  value={monthlyIncrease}
                  onChange={setMonthlyIncrease}
                  prefix="€"
                  suffix="/mo"
                  hint="New recurring costs"
                  color="red"
                />
                <NumberField
                  label="One-Time Cash Injection"
                  value={oneTimeCash}
                  onChange={setOneTimeCash}
                  prefix="€"
                  hint="Funding, sale, etc."
                  color="blue"
                />
                <NumberField
                  label="Revenue Growth"
                  value={revenueGrowthPct}
                  onChange={setRevenueGrowthPct}
                  suffix="%"
                  hint="Annual growth rate applied monthly"
                  color="purple"
                  step={1}
                />
              </div>

              {/* Save */}
              <div className="card">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Save Scenario
                </p>
                <input
                  className="input mb-3"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="Scenario name"
                />
                <button
                  onClick={saveScenario}
                  disabled={saving}
                  className="btn-primary w-full"
                >
                  {saving ? "Saving..." : "Save Scenario"}
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="lg:col-span-2 space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                    Baseline Runway
                  </p>
                  <p className="text-xl font-bold text-slate-300 tabular-nums">
                    {baseRunway > 100 ? "100+" : baseRunway.toFixed(1)}
                    <span className="text-sm font-normal text-slate-500 ml-1">mo</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {formatCurrency(baseAvgBurn)}/mo burn · {formatCurrency(currentCashBase)} cash
                  </p>
                </div>
                <div className="card">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                    Scenario Runway
                  </p>
                  <p
                    className={`text-xl font-bold tabular-nums ${
                      resultRunway > 18
                        ? "text-green-400"
                        : resultRunway >= 12
                        ? "text-yellow-400"
                        : "text-red-400"
                    }`}
                  >
                    {resultRunway > 100 ? "100+" : resultRunway.toFixed(1)}
                    <span className="text-sm font-normal text-slate-500 ml-1">mo</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {formatCurrency(adjustedBurn)}/mo burn · Zero cash {zeroCashDate}
                  </p>
                </div>
                <div className="card">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                    Runway Delta
                  </p>
                  <p
                    className={`text-xl font-bold tabular-nums ${
                      delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-slate-400"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta > 100 ? "100+" : delta.toFixed(1)}
                    <span className="text-sm font-normal text-slate-500 ml-1">mo</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">vs baseline</p>
                </div>
                <div className="card">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                    Adjusted Burn
                  </p>
                  <p className="text-xl font-bold text-slate-100 tabular-nums">
                    {formatCurrency(adjustedBurn)}
                    <span className="text-sm font-normal text-slate-500 ml-1">/mo</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {adjustedBurn < baseAvgBurn
                      ? `↓ ${formatCurrency(baseAvgBurn - adjustedBurn)}/mo saved`
                      : adjustedBurn > baseAvgBurn
                      ? `↑ ${formatCurrency(adjustedBurn - baseAvgBurn)}/mo added`
                      : "No change"}
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="card">
                <h2 className="text-sm font-semibold text-slate-300 mb-4">
                  Cash Trajectory Comparison
                </h2>
                <ScenarioComparisonChart data={chartData} />
                <p className="text-xs text-slate-600 mt-2">
                  Grey dashed = baseline ({windowMonths}-mo avg) · Green = scenario
                </p>
              </div>

              {/* Saved scenarios */}
              {data!.scenarios.length > 0 && (
                <div className="card">
                  <h2 className="text-sm font-semibold text-slate-300 mb-4">
                    Saved Scenarios
                  </h2>
                  <div className="space-y-2">
                    {data!.scenarios.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between py-2 px-3 bg-slate-800 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-100">{s.name}</p>
                          <p className="text-xs text-slate-500">
                            Runway:{" "}
                            <span
                              className={
                                (s.resultRunwayMonths ?? 0) > 18
                                  ? "text-green-400"
                                  : "text-yellow-400"
                              }
                            >
                              {(s.resultRunwayMonths ?? 0) > 100
                                ? "100+"
                                : (s.resultRunwayMonths ?? 0).toFixed(1)}{" "}
                              mo
                            </span>{" "}
                            · Delta:{" "}
                            <span
                              className={
                                (s.resultRunwayDelta ?? 0) >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                              }
                            >
                              {(s.resultRunwayDelta ?? 0) >= 0 ? "+" : ""}
                              {(s.resultRunwayDelta ?? 0).toFixed(1)} mo
                            </span>
                          </p>
                        </div>
                        <button
                          onClick={() => deleteScenario(s.id)}
                          className="text-slate-600 hover:text-red-400 text-sm transition-colors px-2"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── NumberField component ───────────────────────────────────────────────────

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  color,
  step = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  color: "green" | "red" | "blue" | "purple";
  step?: number;
}) {
  const accentClass = {
    green: "focus:ring-green-500",
    red: "focus:ring-red-500",
    blue: "focus:ring-blue-500",
    purple: "focus:ring-purple-500",
  }[color];

  const labelColorClass = {
    green: "text-green-400",
    red: "text-red-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
  }[color];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className={`text-xs font-medium ${labelColorClass}`}>{label}</label>
        {hint && <span className="text-xs text-slate-600">{hint}</span>}
      </div>
      <div className="flex items-center gap-1">
        {prefix && (
          <span className="text-slate-400 text-sm font-medium select-none">{prefix}</span>
        )}
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(isNaN(n) || n < 0 ? 0 : n);
          }}
          className={`
            bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100
            focus:outline-none focus:ring-2 focus:border-transparent
            tabular-nums w-full text-sm
            ${accentClass}
          `}
        />
        {suffix && (
          <span className="text-slate-400 text-sm font-medium select-none whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
