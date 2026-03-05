/**
 * analytics.ts — KPI calculations from aggregate data
 * Reads from monthly_summaries and vendors tables only.
 */

import type { MonthlySummary, Vendor } from "./types";

export interface RunwayMetrics {
  currentCash: number;
  runwayMonths: number;
  avgMonthlyBurn: number;
  zeroCashDate: string;
  fixedRecurring: number;
  biggestVendorAlias: string;
  biggestVendorSpend: number;
  burnTrend: "up" | "down" | "flat";
  windowMonths: number; // which window was used
}

export function computeRunwayMetrics(
  summaries: MonthlySummary[],
  vendorList: Vendor[],
  windowMonths = 6
): RunwayMetrics {
  const sorted = [...summaries].sort((a, b) => a.month.localeCompare(b.month));

  const latestSummary = sorted[sorted.length - 1];
  const currentCash = latestSummary?.closingBalance ?? 0;

  // Rolling average net burn over chosen window
  const windowSlice = sorted.slice(-windowMonths);
  const avgMonthlyBurn =
    windowSlice.length > 0
      ? windowSlice.reduce((s, m) => s + m.netBurn, 0) / windowSlice.length
      : 0;

  const runwayMonths =
    avgMonthlyBurn > 0 ? currentCash / avgMonthlyBurn : Infinity;

  const zeroCashDate = computeZeroCashDate(currentCash, avgMonthlyBurn);

  const fixedRecurring = vendorList
    .filter((v) => v.isRecurring)
    .reduce((s, v) => s + (v.monthlyAvg ?? 0), 0);

  const sortedVendors = [...vendorList].sort(
    (a, b) => (b.totalSpend ?? 0) - (a.totalSpend ?? 0)
  );
  const biggestVendor = sortedVendors[0];

  const burnTrend = computeBurnTrend(sorted, windowMonths);

  return {
    currentCash,
    runwayMonths: Math.max(0, runwayMonths),
    avgMonthlyBurn,
    zeroCashDate,
    fixedRecurring,
    biggestVendorAlias: biggestVendor?.displayAlias ?? "—",
    biggestVendorSpend: biggestVendor?.totalSpend ?? 0,
    burnTrend,
    windowMonths,
  };
}

export function computeZeroCashDate(
  currentCash: number,
  avgMonthlyBurn: number
): string {
  if (avgMonthlyBurn <= 0) return "Never";
  const monthsLeft = currentCash / avgMonthlyBurn;
  if (!isFinite(monthsLeft) || monthsLeft > 120) return "120+ months";
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setMonth(futureDate.getMonth() + Math.floor(monthsLeft));
  return futureDate.toISOString().slice(0, 7); // "2028-06"
}

function computeBurnTrend(
  sorted: MonthlySummary[],
  windowMonths: number
): "up" | "down" | "flat" {
  const half = Math.max(Math.floor(windowMonths / 2), 1);
  if (sorted.length < half * 2) return "flat";
  const recent = sorted.slice(-half);
  const prior = sorted.slice(-half * 2, -half);
  const recentAvg = recent.reduce((s, m) => s + m.netBurn, 0) / recent.length;
  const priorAvg = prior.reduce((s, m) => s + m.netBurn, 0) / prior.length;
  if (priorAvg === 0) return "flat";
  const diff = recentAvg - priorAvg;
  if (diff > priorAvg * 0.05) return "up";
  if (diff < -priorAvg * 0.05) return "down";
  return "flat";
}

export function runwayColor(months: number): string {
  if (months > 18) return "text-green-500";
  if (months >= 12) return "text-yellow-500";
  return "text-red-500";
}

export function formatCurrency(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1000) {
    return `€${(amount / 1000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatMonth(month: string): string {
  const [year, mo] = month.split("-");
  const date = new Date(parseInt(year), parseInt(mo) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export interface ProjectedPoint {
  month: string;
  label: string;
  balance: number;
  isProjected: boolean;
  bestCase: number;
  worstCase: number;
}

export function buildCashTrajectory(
  summaries: MonthlySummary[],
  projectionMonths = 12,
  windowMonths = 6
): ProjectedPoint[] {
  const sorted = [...summaries].sort((a, b) => a.month.localeCompare(b.month));
  const points: ProjectedPoint[] = sorted.map((s) => ({
    month: s.month,
    label: formatMonth(s.month),
    balance: s.closingBalance ?? 0,
    isProjected: false,
    bestCase: s.closingBalance ?? 0,
    worstCase: s.closingBalance ?? 0,
  }));

  if (sorted.length === 0) return points;

  const windowSlice = sorted.slice(-windowMonths);
  const avgBurn =
    windowSlice.reduce((s, m) => s + m.netBurn, 0) / windowSlice.length;
  const stdDev =
    Math.sqrt(
      windowSlice.reduce((s, m) => s + Math.pow(m.netBurn - avgBurn, 2), 0) /
        windowSlice.length
    ) || avgBurn * 0.15;

  const lastSummary = sorted[sorted.length - 1];
  let balance = lastSummary.closingBalance ?? 0;
  const lastMonth = lastSummary.month;

  for (let i = 1; i <= projectionMonths; i++) {
    const [year, mo] = lastMonth.split("-").map(Number);
    const futureDate = new Date(year, mo - 1 + i, 1);
    const futureMonth = futureDate.toISOString().slice(0, 7);
    balance = Math.max(0, balance - avgBurn);
    points.push({
      month: futureMonth,
      label: formatMonth(futureMonth),
      balance: Math.round(balance),
      isProjected: true,
      bestCase: Math.round(Math.max(0, balance + stdDev * i * 0.5)),
      worstCase: Math.round(Math.max(0, balance - stdDev * i * 0.5)),
    });
    if (balance <= 0) break;
  }

  return points;
}
