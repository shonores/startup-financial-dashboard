/**
 * Upload route — receives one or more CSVs as FormData, parses each in memory,
 * merges all transactions, persists aggregates only.
 *
 * CRITICAL INVARIANT: CSV file Buffers never touch disk.
 * Multiple files (different bank accounts) are merged before aggregation
 * so the dashboard shows a unified view across all accounts.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseBuffer } from "@/lib/parser";
import { aggregateAndPersist } from "@/lib/aggregator";
import { db } from "@/lib/db";
import { monthlySummaries, vendors } from "@/lib/schema";
import { desc } from "drizzle-orm";
import type { TransactionRecord } from "@/lib/parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Required for better-sqlite3

export async function POST(request: Request) {
  // Auth check — only owners can upload
  try {
    const session = await requireAuth();
    if (session.role !== "owner" && session.role !== "collaborator") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  // Accept multiple files under the same "file" key
  const files = formData.getAll("file") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Parse each file in memory and merge all transactions
  let allTransactions: TransactionRecord[] = [];
  let totalRows = 0;
  const parseErrors: string[] = [];
  const fileResults: Array<{
    name: string;
    processedRows: number;
    monthsCovered: string;
  }> = [];

  for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
    const file = files[fileIdx];
    // Read into Buffer — stays in RAM, never written to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      const result = await parseBuffer(buffer, file.name);
      // Tag each transaction with its source account index so the aggregator
      // can sum closing balances across accounts correctly.
      const tagged = result.transactions.map((tx) => ({ ...tx, accountIdx: fileIdx }));
      allTransactions = allTransactions.concat(tagged);
      totalRows += result.totalRows;
      fileResults.push({
        name: file.name,
        processedRows: result.processedRows,
        monthsCovered: result.monthsCovered,
      });
    } catch (err) {
      parseErrors.push(
        `${file.name}: ${err instanceof Error ? err.message : "parse error"}`
      );
    }
  }

  // If every file failed to parse, return an error
  if (allTransactions.length === 0 && fileResults.length === 0) {
    return NextResponse.json(
      { error: `All files failed to parse. ${parseErrors.join(" | ")}` },
      { status: 422 }
    );
  }

  const processedRows = allTransactions.length;

  // Sort merged transactions by date so closing-balance logic is correct
  allTransactions.sort((a, b) => a.date.localeCompare(b.date));

  // Persist aggregates only
  let aggregateResult;
  try {
    aggregateResult = aggregateAndPersist(allTransactions, totalRows);
  } catch (err) {
    console.error("Aggregation error:", err);
    return NextResponse.json({ error: "Failed to process data" }, { status: 500 });
  } finally {
    // CRITICAL: Discard transaction array regardless of outcome
    allTransactions = null as unknown as typeof allTransactions;
  }

  // Quick summary for the response
  const latestMonth = await db
    .select()
    .from(monthlySummaries)
    .orderBy(desc(monthlySummaries.month))
    .limit(1)
    .get();

  const topVendor = await db
    .select()
    .from(vendors)
    .orderBy(desc(vendors.totalSpend))
    .limit(1)
    .get();

  return NextResponse.json({
    success: true,
    summary: {
      filesProcessed: fileResults.length,
      totalRowsInFiles: totalRows,
      processedRows,
      fileResults,
      parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
      monthsInDashboard: aggregateResult.monthsWritten,
      vendorsTracked: aggregateResult.vendorsWritten,
      latestMonth: latestMonth?.month ?? null,
      latestClosingBalance: latestMonth?.closingBalance ?? null,
      topVendorAlias: topVendor?.displayAlias ?? null,
    },
    privacyNote:
      "Your bank statements were processed in memory and were not stored. Only monthly totals and anonymous vendor summaries were saved.",
  });
}
