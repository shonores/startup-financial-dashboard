import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { vendors, categorySplits, monthlySummaries } from "@/lib/schema";
import { desc, asc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const vendorList = await db
    .select()
    .from(vendors)
    .orderBy(desc(vendors.totalSpend))
    .limit(limit)
    .all();

  // Category splits — latest month
  const latestSummary = await db
    .select()
    .from(monthlySummaries)
    .orderBy(desc(monthlySummaries.month))
    .limit(1)
    .get();

  const latestMonth = latestSummary?.month;

  const allSplits = await db
    .select()
    .from(categorySplits)
    .orderBy(asc(categorySplits.month))
    .all();

  const latestSplits = latestMonth
    ? allSplits.filter((s) => s.month === latestMonth)
    : [];

  // Detect vendor alerts: recent avg > 20% above lifetime avg
  const alerts = vendorList
    .filter((v) => {
      // Simple heuristic: if monthly avg is significant and vendor is not recurring
      // In practice we'd compare recent months vs lifetime, but we only have lifetime avg
      // Flag vendors where totalSpend > 5x monthlyAvg (suggesting a recent spike)
      const monthlyAvg = v.monthlyAvg ?? 0;
      const totalSpend = v.totalSpend ?? 0;
      const monthCount = v.monthCount ?? 1;
      return monthCount > 3 && monthlyAvg > 0 && !v.isRecurring && totalSpend / monthCount > monthlyAvg * 1.2;
    })
    .map((v) => ({
      alias: v.displayAlias,
      category: v.category,
      issue: "Spend increasing above historical average",
    }));

  // Category duplicate detection
  const categoryGroups: Record<string, typeof vendorList> = {};
  for (const v of vendorList) {
    const cat = v.category ?? "Other";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(v);
  }
  const duplicateAlerts = Object.entries(categoryGroups)
    .filter(([, vs]) => vs.length > 2 && !["Other Transfers", "Other", "Payroll & Contractors"].includes(vs[0]?.category ?? ""))
    .map(([cat, vs]) => ({
      category: cat,
      count: vs.length,
      aliases: vs.slice(0, 3).map((v) => v.displayAlias),
      issue: `${vs.length} vendors in same category — potential duplicates`,
    }));

  return NextResponse.json({
    vendors: vendorList,
    categorySplits: allSplits,
    latestCategorySplits: latestSplits,
    alerts,
    duplicateAlerts,
  });
}
