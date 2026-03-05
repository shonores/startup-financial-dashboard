/**
 * DELETE /api/data — truncate all aggregate tables (owner only)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  monthlySummaries,
  vendors,
  categorySplits,
  scenarios,
  uploadLog,
} from "@/lib/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE() {
  try {
    const session = await requireAuth();
    if (session.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can delete all data" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  db.delete(monthlySummaries).run();
  db.delete(vendors).run();
  db.delete(categorySplits).run();
  db.delete(scenarios).run();
  db.delete(uploadLog).run();

  return NextResponse.json({
    success: true,
    message:
      "All dashboard data deleted. Note: There was never any sensitive financial data stored.",
  });
}
