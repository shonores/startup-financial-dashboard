/**
 * Upload route — receives one or more files as FormData,
 * parses each in memory, merges all transactions, computes
 * aggregates in memory, and returns them as JSON.
 *
 * No database. No auth. No data ever written to disk.
 */

export const config = {
  api: { bodyParser: { sizeLimit: "50mb" } },
};

import { NextResponse } from "next/server";
import { parseBuffer } from "@/lib/parser";
import { aggregate } from "@/lib/aggregator";
import type { TransactionRecord } from "@/lib/parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = formData.getAll("file") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let allTransactions: TransactionRecord[] = [];
  let totalRows = 0;
  const parseErrors: string[] = [];
  const fileResults: Array<{
    name: string;
    processedRows: number;
    monthsCovered: string;
  }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      const result = await parseBuffer(buffer, file.name);
      const tagged = result.transactions.map((tx) => ({
        ...tx,
        accountIdx: i,
      }));
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

  if (allTransactions.length === 0 && fileResults.length === 0) {
    return NextResponse.json(
      { error: `All files failed to parse. ${parseErrors.join(" | ")}` },
      { status: 422 }
    );
  }

  // Sort by date before aggregating
  allTransactions.sort((a, b) => a.date.localeCompare(b.date));

  const { monthlySummaries, vendors } = aggregate(allTransactions);

  // Discard transactions — only aggregates leave this function
  allTransactions = null as unknown as typeof allTransactions;

  const allMonths = monthlySummaries.map((s) => s.month).sort();
  const monthsCovered =
    allMonths.length > 0
      ? `${allMonths[0]} to ${allMonths[allMonths.length - 1]}`
      : "no data";

  return NextResponse.json({
    success: true,
    monthlySummaries,
    vendors,
    meta: {
      filesProcessed: fileResults.length,
      processedRows: totalRows,
      monthsCovered,
      fileResults,
      parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
    },
  });
}
