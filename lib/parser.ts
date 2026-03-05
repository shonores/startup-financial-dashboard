/**
 * parser.ts — CSV Buffer → TransactionRecord[]
 *
 * Input:  Buffer (from FormData file upload — never touches disk)
 * Output: TransactionRecord[] (in-memory array, never persisted)
 *
 * Revolut Business CSV format: 28 columns, comma-delimited, UTF-8 with BOM
 * Col indices:
 *   0  = Date started (UTC)
 *   2  = ID (UUID)
 *   3  = Type
 *   4  = State
 *   5  = Description
 *   7  = Payer (NOT stored)
 *   14 = Amount
 *   16 = Exchange rate
 *   19 = Balance
 *   20 = Account currency
 *   25 = MCC
 */

import { parse } from "csv-parse/sync";

export interface TransactionRecord {
  date: string; // "2025-12-15"
  month: string; // "2025-12"
  type: string;
  vendorKey: string; // normalized, never persisted as real name
  amountEur: number;
  balanceEur: number | null;
  mcc: number | null;
  isOutflow: boolean;
  accountIdx: number; // 0-based source file index, set by caller
}

// Fallback exchange rates to EUR (approximate)
const FALLBACK_RATES: Record<string, number> = {
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.05,
  SEK: 0.088,
  NOK: 0.084,
  DKK: 0.134,
  PLN: 0.23,
  CZK: 0.041,
  HUF: 0.0026,
  RON: 0.2,
  BGN: 0.51,
};

function normalizeVendorKey(description: string): string {
  return description.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toEur(
  amount: number,
  currency: string,
  exchangeRate: string | null
): number {
  if (currency === "EUR") return amount;
  const rate = exchangeRate ? parseFloat(exchangeRate) : null;
  if (rate && rate > 0) return amount / rate;
  const fallback = FALLBACK_RATES[currency.toUpperCase()];
  if (fallback) return amount * fallback;
  return amount; // best-effort — treat as EUR if unknown currency
}

export interface ParseResult {
  transactions: TransactionRecord[];
  totalRows: number;
  processedRows: number;
  monthsCovered: string;
}

export function parseRevolutCSV(buffer: Buffer): ParseResult {
  // Strip BOM if present
  let csvString = buffer.toString("utf-8");
  if (csvString.charCodeAt(0) === 0xfeff) {
    csvString = csvString.slice(1);
  }

  const rows: string[][] = parse(csvString, {
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];

  if (rows.length < 2) {
    throw new Error("CSV appears empty or has no data rows.");
  }

  const header = rows[0];

  // Validate it's a Revolut Business export
  const hasDateCol = header.some(
    (h) => h.includes("Date started") || h.includes("Started Date")
  );
  const hasAmountCol = header.some((h) => h.toLowerCase().includes("amount"));
  if (!hasDateCol || !hasAmountCol) {
    throw new Error(
      "File does not appear to be a Revolut Business CSV export. " +
        "Expected columns: 'Date started (UTC)' and 'Amount'."
    );
  }

  const totalRows = rows.length - 1;
  const transactions: TransactionRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 21) continue;

    const state = (row[4] ?? "").trim().toUpperCase();
    const type = (row[3] ?? "").trim().toUpperCase();

    // Skip non-COMPLETED and EXCHANGE rows
    if (state !== "COMPLETED") continue;
    if (type === "EXCHANGE") continue;

    const date = (row[0] ?? "").trim().slice(0, 10); // "2025-12-15"
    if (!date || date.length < 7) continue;

    const month = date.slice(0, 7); // "2025-12"
    const description = (row[5] ?? "").trim();
    const amountRaw = parseFloat(row[14] ?? "0");
    const exchangeRate = (row[16] ?? "").trim() || null;
    const balanceRaw = parseFloat(row[19] ?? "NaN");
    const currency = (row[20] ?? "EUR").trim().toUpperCase();
    const mccRaw = (row[25] ?? "").trim();

    if (isNaN(amountRaw)) continue;

    const amountEur = toEur(amountRaw, currency, exchangeRate);
    const balanceEur = isNaN(balanceRaw)
      ? null
      : toEur(balanceRaw, currency, exchangeRate);
    const mcc = mccRaw ? parseInt(mccRaw, 10) : null;

    transactions.push({
      date,
      month,
      type,
      vendorKey: normalizeVendorKey(description),
      amountEur,
      balanceEur,
      mcc: mcc && !isNaN(mcc) ? mcc : null,
      isOutflow: amountEur < 0,
      accountIdx: 0, // caller overrides this per-file
    });
  }

  const months = [...new Set(transactions.map((t) => t.month))].sort();
  const monthsCovered =
    months.length > 0
      ? `${months[0]} to ${months[months.length - 1]}`
      : "no data";

  return {
    transactions,
    totalRows,
    processedRows: transactions.length,
    monthsCovered,
  };
}

// ─── Unified multi-format dispatcher ─────────────────────────────────────────

import { parsePdf } from "./parsePdf";
import { parseExcel } from "./parseExcel";

/**
 * parseBuffer — dispatches to the correct parser based on file extension.
 * CSV files use parseRevolutCSV; .pdf uses parsePdf; .xlsx/.xls uses parseExcel.
 */
export async function parseBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParseResult> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf") {
    return parsePdf(buffer);
  }

  if (ext === "xlsx" || ext === "xls") {
    return parseExcel(buffer);
  }

  // Default: CSV (Revolut or generic)
  return parseRevolutCSV(buffer);
}
