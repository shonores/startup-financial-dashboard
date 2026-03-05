import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthlySummaries, vendors, uploadLog } from "@/lib/schema";
import { desc, asc } from "drizzle-orm";
import { computeRunwayMetrics, buildCashTrajectory } from "@/lib/analytics";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summaries = await db
    .select()
    .from(monthlySummaries)
    .orderBy(asc(monthlySummaries.month))
    .all();

  const vendorList = await db
    .select()
    .from(vendors)
    .orderBy(desc(vendors.totalSpend))
    .all();

  const latestUpload = await db
    .select()
    .from(uploadLog)
    .orderBy(desc(uploadLog.id))
    .limit(1)
    .get();

  const metrics = computeRunwayMetrics(summaries, vendorList);
  const trajectory = buildCashTrajectory(summaries, 18);

  return NextResponse.json({
    summaries,
    metrics,
    trajectory,
    lastUpload: latestUpload ?? null,
  });
}
