/**
 * scenarios.ts — Compute scenario projections from baseline metrics
 */

import type { MonthlySummary } from "./schema";
import { computeZeroCashDate } from "./analytics";

export interface ScenarioInput {
  name: string;
  monthlySavings: number;
  monthlyIncrease: number;
  oneTimeCash: number;
  revenueGrowthPct: number;
}

export interface ScenarioResult extends ScenarioInput {
  resultRunwayMonths: number;
  resultZeroCashDate: string;
  resultRunwayDelta: number;
  baselineRunwayMonths: number;
}

export function computeScenario(
  input: ScenarioInput,
  summaries: MonthlySummary[],
  windowMonths = 6
): ScenarioResult {
  const sorted = [...summaries].sort((a, b) => a.month.localeCompare(b.month));

  const latestSummary = sorted[sorted.length - 1];
  const currentCash = (latestSummary?.closingBalance ?? 0) + input.oneTimeCash;

  const windowSlice = sorted.slice(-windowMonths);
  const baseAvgBurn =
    windowSlice.length > 0
      ? windowSlice.reduce((s, m) => s + m.netBurn, 0) / windowSlice.length
      : 0;
  const baseAvgInflows =
    windowSlice.length > 0
      ? windowSlice.reduce((s, m) => s + m.inflows, 0) / windowSlice.length
      : 0;

  const baseRunwayMonths =
    baseAvgBurn > 0 ? (latestSummary?.closingBalance ?? 0) / baseAvgBurn : Infinity;

  // Adjusted burn: apply savings, increases, and revenue growth
  const adjustedInflows = baseAvgInflows * (1 + input.revenueGrowthPct / 100);
  const adjustedBurn = Math.max(
    0,
    baseAvgBurn +
      input.monthlyIncrease -
      input.monthlySavings -
      (adjustedInflows - baseAvgInflows)
  );

  const resultRunwayMonths =
    adjustedBurn > 0 ? currentCash / adjustedBurn : Infinity;
  const resultZeroCashDate = computeZeroCashDate(currentCash, adjustedBurn);
  const baselineRunwayMonths = isFinite(baseRunwayMonths) ? baseRunwayMonths : 999;
  const resultRunwayDelta = isFinite(resultRunwayMonths)
    ? resultRunwayMonths - baselineRunwayMonths
    : 999 - baselineRunwayMonths;

  return {
    ...input,
    resultRunwayMonths: isFinite(resultRunwayMonths)
      ? Math.round(resultRunwayMonths * 10) / 10
      : 999,
    resultZeroCashDate,
    resultRunwayDelta: Math.round(resultRunwayDelta * 10) / 10,
    baselineRunwayMonths: Math.round(baselineRunwayMonths * 10) / 10,
  };
}
