/**
 * parseExcel.ts — Generic Excel (.xlsx / .xls) bank statement parser
 *
 * Heuristically detects columns for date, description, and amount.
 * Handles both separate debit/credit columns and a single signed amount column.
 *
 * Privacy: vendorKey is normalized. No raw descriptions stored.
 */

import * as XLSX from "xlsx";
import type { TransactionRecord, ParseResult } from "./parser";

function normalizeVendorKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Try to parse various date formats into YYYY-MM-DD */
function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;

  // Excel serial date number
  if (typeof raw === "number") {
    const date = XLSX.SSF.parse_date_code(raw);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  const s = String(raw).trim();

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // European: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const eu = s.match(/^(\d{2})[-./](\d{2})[-./](\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;

  // US: MM/DD/YYYY
  const us = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;

  return null;
}

/** Parse an amount string that may use European format */
function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;

  const s = String(raw)
    .trim()
    .replace(/[€$£¥\s]/g, "");

  if (!s || s === "-" || s === "+") return null;

  // Detect European format (1.234,56) vs US format (1,234.56)
  const commaIdx = s.lastIndexOf(",");
  const dotIdx = s.lastIndexOf(".");

  let normalized: string;
  if (commaIdx > dotIdx) {
    // European: dot = thousands, comma = decimal
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // US/standard: comma = thousands, dot = decimal
    normalized = s.replace(/,/g, "");
  }

  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

/** Score a header string for a given column type */
function headerScore(header: string, keywords: string[]): number {
  const h = header.toLowerCase();
  return keywords.reduce((score, kw) => (h.includes(kw) ? score + 1 : score), 0);
}

const DATE_KEYWORDS = ["date", "fecha", "datum", "data"];
const DESC_KEYWORDS = ["description", "descripción", "omschrijving", "memo", "reference", "ref", "details", "concept"];
const AMOUNT_KEYWORDS = ["amount", "importe", "bedrag", "quantity", "cantidad"];
const DEBIT_KEYWORDS = ["debit", "débito", "debito", "out", "charge", "withdrawal"];
const CREDIT_KEYWORDS = ["credit", "crédito", "credito", "in", "deposit"];

export function parseExcel(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // Use the first sheet with data
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  }) as unknown[][];

  if (rows.length < 2) {
    throw new Error("Excel file appears empty or has no data rows.");
  }

  // Find header row (first row with recognizable column names)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    const hasDate = row.some(
      (cell) => typeof cell === "string" && headerScore(cell, DATE_KEYWORDS) > 0
    );
    const hasAmount = row.some(
      (cell) =>
        typeof cell === "string" &&
        (headerScore(cell, AMOUNT_KEYWORDS) > 0 ||
          headerScore(cell, DEBIT_KEYWORDS) > 0)
    );
    if (hasDate && hasAmount) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (rows[headerRowIdx] as unknown[]).map((h) =>
    String(h ?? "").trim()
  );

  // Find column indices
  const dateCol = headers.reduce(
    (best, h, i) => {
      const s = headerScore(h, DATE_KEYWORDS);
      return s > best.score ? { col: i, score: s } : best;
    },
    { col: -1, score: 0 }
  ).col;

  const descCol = headers.reduce(
    (best, h, i) => {
      const s = headerScore(h, DESC_KEYWORDS);
      return s > best.score ? { col: i, score: s } : best;
    },
    { col: -1, score: 0 }
  ).col;

  const amountCol = headers.reduce(
    (best, h, i) => {
      const s = headerScore(h, AMOUNT_KEYWORDS);
      return s > best.score ? { col: i, score: s } : best;
    },
    { col: -1, score: 0 }
  ).col;

  const debitCol = headers.reduce(
    (best, h, i) => {
      const s = headerScore(h, DEBIT_KEYWORDS);
      return s > best.score ? { col: i, score: s } : best;
    },
    { col: -1, score: 0 }
  ).col;

  const creditCol = headers.reduce(
    (best, h, i) => {
      const s = headerScore(h, CREDIT_KEYWORDS);
      return s > best.score ? { col: i, score: s } : best;
    },
    { col: -1, score: 0 }
  ).col;

  if (dateCol === -1) {
    throw new Error(
      "Could not find a date column in the Excel file. " +
        `Headers found: ${headers.join(", ")}`
    );
  }

  const transactions: TransactionRecord[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell) => cell === null || cell === "")) continue;

    const date = parseDate(row[dateCol]);
    if (!date || date.length < 7) continue;

    const month = date.slice(0, 7);
    const desc = descCol >= 0 ? String(row[descCol] ?? "").trim() : "";

    let amountEur: number;

    if (debitCol >= 0 && creditCol >= 0) {
      // Separate debit and credit columns
      const debitAmt = parseAmount(row[debitCol]);
      const creditAmt = parseAmount(row[creditCol]);
      if (debitAmt !== null && debitAmt !== 0) {
        amountEur = -Math.abs(debitAmt); // debits are outflows
      } else if (creditAmt !== null && creditAmt !== 0) {
        amountEur = Math.abs(creditAmt); // credits are inflows
      } else {
        continue; // no amount
      }
    } else if (amountCol >= 0) {
      const amt = parseAmount(row[amountCol]);
      if (amt === null || amt === 0) continue;
      amountEur = amt;
    } else {
      continue;
    }

    transactions.push({
      date,
      month,
      type: "CARD_PAYMENT",
      vendorKey: normalizeVendorKey(desc || "unknown"),
      amountEur,
      balanceEur: null,
      mcc: null,
      isOutflow: amountEur < 0,
      accountIdx: 0,
    });
  }

  if (transactions.length === 0) {
    throw new Error(
      "No transactions found in the Excel file. " +
        "Make sure the file has date and amount columns."
    );
  }

  const months = [...new Set(transactions.map((t) => t.month))].sort();

  return {
    transactions,
    totalRows: rows.length - headerRowIdx - 1,
    processedRows: transactions.length,
    monthsCovered:
      months.length > 0
        ? `${months[0]} to ${months[months.length - 1]}`
        : "no data",
  };
}
