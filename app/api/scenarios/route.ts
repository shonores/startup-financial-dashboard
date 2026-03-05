import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { scenarios, monthlySummaries } from "@/lib/schema";
import { eq, asc, desc } from "drizzle-orm";
import { computeScenario } from "@/lib/scenarios";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scenarioList = await db
    .select()
    .from(scenarios)
    .orderBy(asc(scenarios.createdAt))
    .all();

  const summaries = await db
    .select()
    .from(monthlySummaries)
    .orderBy(asc(monthlySummaries.month))
    .all();

  const last6 = summaries.slice(-6);
  const baseAvgBurn =
    last6.length > 0
      ? last6.reduce((s, m) => s + m.netBurn, 0) / last6.length
      : 0;

  const latestSummary = summaries[summaries.length - 1];
  const currentCash = latestSummary?.closingBalance ?? 0;
  const baselineRunwayMonths =
    baseAvgBurn > 0 ? Math.round((currentCash / baseAvgBurn) * 10) / 10 : 999;

  return NextResponse.json({
    scenarios: scenarioList,
    baseline: {
      avgMonthlyBurn: Math.round(baseAvgBurn),
      currentCash,
      runwayMonths: baselineRunwayMonths,
    },
    summaries,
  });
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (session.role === "viewer") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    monthlySavings?: number;
    monthlyIncrease?: number;
    oneTimeCash?: number;
    revenueGrowthPct?: number;
  };

  if (!body.name) {
    return NextResponse.json({ error: "Scenario name required" }, { status: 400 });
  }

  const summaries = await db
    .select()
    .from(monthlySummaries)
    .orderBy(asc(monthlySummaries.month))
    .all();

  const input = {
    name: body.name,
    monthlySavings: body.monthlySavings ?? 0,
    monthlyIncrease: body.monthlyIncrease ?? 0,
    oneTimeCash: body.oneTimeCash ?? 0,
    revenueGrowthPct: body.revenueGrowthPct ?? 0,
  };

  const result = computeScenario(input, summaries);

  const inserted = await db
    .insert(scenarios)
    .values({
      name: result.name,
      monthlySavings: result.monthlySavings,
      monthlyIncrease: result.monthlyIncrease,
      oneTimeCash: result.oneTimeCash,
      revenueGrowthPct: result.revenueGrowthPct,
      resultRunwayMonths: result.resultRunwayMonths,
      resultZeroCashDate: result.resultZeroCashDate,
      resultRunwayDelta: result.resultRunwayDelta,
    })
    .returning()
    .get();

  return NextResponse.json({ scenario: inserted, computation: result });
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAuth();
    if (session.role === "viewer") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Scenario ID required" }, { status: 400 });
  }

  await db.delete(scenarios).where(eq(scenarios.id, parseInt(id, 10))).run();

  return NextResponse.json({ success: true });
}
