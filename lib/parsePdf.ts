/**
 * parsePdf.ts — Multi-bank PDF statement parser
 *
 * Supported formats:
 *   - N26 (Spain/EU): "Extracto bancario" — explicit +/- amounts in text
 *   - ABN AMRO (Netherlands): "Account Balance" — debit/credit table columns
 *
 * Privacy: vendorKey is normalized (no real names/IBANs stored).
 */

import type { TransactionRecord, ParseResult } from "./parser";

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalizeVendorKey(description: string): string {
  return description.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parse European-style amount with optional ± prefix and € suffix.
 * Examples: "-4,99€"  "+1.500,00€"  "17,99"  "1.015,31"  ""
 */
function parseEurAmount(s: string): number | null {
  const cleaned = s
    .replace(/[€+\s]/g, "")
    .trim();
  if (!cleaned || cleaned === "-") return null;
  // European format: dot = thousands separator, comma = decimal
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

/** Convert DD-MM-YYYY or DD.MM.YYYY → YYYY-MM-DD */
function normalizeDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toResult(
  transactions: TransactionRecord[],
  total: number
): ParseResult {
  const months = [...new Set(transactions.map((t) => t.month))].sort();
  return {
    transactions,
    totalRows: total,
    processedRows: transactions.length,
    monthsCovered:
      months.length > 0
        ? `${months[0]} to ${months[months.length - 1]}`
        : "no data",
  };
}

// ─── ABN AMRO parser ─────────────────────────────────────────────────────────
// Text-based state machine. pdf-parse v2 doesn't detect ABN AMRO tables (no
// vector grid), so we parse the plain text.
//
// Structure per transaction:
//   DD-MM-YYYY first-line-of-description     ← transaction anchor
//   [continuation lines...]
//   amount                                   ← standalone European-format amount
//
// All amounts are unsigned in the text; we detect credits via description
// keywords using WHOLE WORD matching to avoid false positives.

// Transaction date anchor: starts with DD-MM-YYYY followed by non-empty text
// Negative lookahead prevents matching embedded date ranges like "01-03-2026 - 01-04-"
const ABN_DATE_LINE_RE = /^(\d{2}-\d{2}-\d{4})(?!\s*-)(\s+(.*))?$/;

// Strict European monetary amount: 1–7 digits, optional dot-thousands, comma decimal
// Examples: "17,99"  "1.015,31"  "154,95"  — NOT "521726374" (no decimal)
const ABN_STRICT_EUR_RE = /^\d{1,7}(?:\.\d{3})*,\d{2}$/;

// Page header/footer lines to skip — specific patterns only to avoid false positives
// from description text that happens to start with a header keyword (e.g. "Amsterdam/MARF/")
const ABN_HEADER_RE =
  /^(Account Balance$|Account holder name|Date interval|Balance \d{2}-\d{2}-\d{4}|Page \d+ of|Number of (debit|credit)|Total amount (debited|credited)|Date Description Amount|-- \d+ of \d+ --|Westermarkt \d|\d{4} [A-Z]{2} Amsterdam|Personal Account \d)/i;

// Keywords that strongly suggest an INCOMING credit (whole-word to avoid "CreditCard")
const ABN_CREDIT_KEYWORDS_RE =
  /\bREFUND\b|\bSALARY\b|\bSALARIS\b|\bBIJSCHRIJVING\b|\bTERUGBOEKING\b|\bTERUGGAVE\b|\bRESTITUTIE\b/i;

function parseAbnAmroText(text: string, rowCount: number): ParseResult {
  const transactions: TransactionRecord[] = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let currentDate = "";
  let descLines: string[] = [];
  let inTransaction = false;

  function flush() {
    if (!currentDate || descLines.length === 0) return;

    // Scan backward through descLines for a line whose LAST space-delimited token
    // is a strict European monetary amount (requires comma decimal)
    let amountStr: string | null = null;
    let amountLineIdx = -1;
    for (let i = descLines.length - 1; i >= 0; i--) {
      const tokens = descLines[i].split(/\s+/);
      const last = tokens[tokens.length - 1];
      if (ABN_STRICT_EUR_RE.test(last)) {
        amountStr = last;
        amountLineIdx = i;
        break;
      }
    }

    if (amountStr === null) return;

    const v = parseEurAmount(amountStr);
    if (v === null || v === 0) return;

    // Use description lines before the amount line as the vendor hint
    const descBefore = descLines.slice(0, amountLineIdx);
    const firstDesc = descBefore[0] ?? descLines[0] ?? "";
    const allDesc = descLines.join(" ");

    const isCreditByKeyword = ABN_CREDIT_KEYWORDS_RE.test(allDesc);
    const amountEur = isCreditByKeyword ? Math.abs(v) : -Math.abs(v);

    transactions.push({
      date: currentDate,
      month: currentDate.slice(0, 7),
      type: "CARD_PAYMENT",
      vendorKey: normalizeVendorKey(firstDesc || "unknown"),
      amountEur,
      balanceEur: null,
      mcc: null,
      isOutflow: !isCreditByKeyword,
      accountIdx: 0,
    });

    descLines = [];
  }

  for (const line of lines) {
    // Skip page headers/footers — only if NOT currently inside a transaction
    // (to avoid misidentifying description continuation as a header)
    if (!inTransaction && ABN_HEADER_RE.test(line)) {
      continue;
    }
    // Certain section boundaries flush the current transaction and stop until next date
    if (
      ABN_HEADER_RE.test(line) &&
      /^(Account Balance$|Account holder name|Date Description Amount|-- \d+ of|Number of|Total amount)/i.test(
        line
      )
    ) {
      flush();
      inTransaction = false;
      currentDate = "";
      continue;
    }

    const dateMatch = line.match(ABN_DATE_LINE_RE);
    if (dateMatch) {
      // New transaction anchor: flush previous, start new
      flush();
      const rawDate = dateMatch[1];
      const desc = dateMatch[3] ?? "";
      currentDate = normalizeDate(rawDate);
      inTransaction = !!currentDate;
      descLines = desc ? [desc] : [];
      continue;
    }

    if (inTransaction) {
      descLines.push(line);
    }
  }

  // Flush the final transaction
  flush();

  return toResult(transactions, rowCount);
}

// ─── N26 parser ──────────────────────────────────────────────────────────────
// pdf-parse v2 extracts N26 statements with this multi-line structure per transaction:
//   <description>
//   <category>  (e.g. "Mastercard • Comida", "Ingresos", "Domiciliación bancaria")
//   [IBAN: ... line(s), optional]
//   [payment reference, optional]
//   Fecha de valor DD.MM.YYYY
//   DD.MM.YYYY [+-]amount€          ← the key line we anchor on
//
// Strategy: find every "date amount" anchor line, then look backward for the description.

const N26_DATE_AMOUNT_RE = /^(\d{2}\.\d{2}\.\d{4})\s+([+-][\d.]+,\d{2}€)$/;

// Lines to skip when searching backward for the description
const N26_SKIP_RE =
  /^(Fecha de valor|IBAN:|BIC:|Mastercard|Visa|Ingresos|Domiciliación|Transferencias|Otros|Compras|Comida|Bares|Transporte|Gastos|Efectivo|Nuestros|Aunque|Para|Tu equipo|Extracto bancario|Descripción|Saldo|Cantidad|SEBASTIAN|Calle|Emitido|Nº|^\d+ \/ \d+$|-- \d+)/i;

function parseN26(text: string, rowCount: number): ParseResult {
  const transactions: TransactionRecord[] = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(N26_DATE_AMOUNT_RE);
    if (!m) continue;

    const date = normalizeDate(m[1]);
    if (!date) continue;

    const amount = parseEurAmount(m[2]);
    if (amount === null) continue;

    // Look backward to find the description (first non-skip line before this anchor)
    let desc = "unknown";
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const prev = lines[j].trim();
      if (!prev || N26_SKIP_RE.test(prev)) continue;
      // This is the description line
      desc = prev;
      break;
    }

    transactions.push({
      date,
      month: date.slice(0, 7),
      type: "CARD_PAYMENT",
      vendorKey: normalizeVendorKey(desc),
      amountEur: amount,
      balanceEur: null,
      mcc: null,
      isOutflow: amount < 0,
      accountIdx: 0,
    });
  }

  return toResult(transactions, rowCount);
}

// ─── Auto-detect and dispatch ─────────────────────────────────────────────────

export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const { PDFParse } = await import("pdf-parse");
  const loader = new PDFParse({ data: buffer });

  const textResult = await loader.getText();
  const text = textResult.text;
  const rowCount = textResult.total;

  try {
    if (/Account Balance|Amount debited/i.test(text)) {
      return parseAbnAmroText(text, rowCount);
    }

    if (/Extracto bancario|Fecha de valor/i.test(text)) {
      return parseN26(text, rowCount);
    }

    throw new Error(
      "PDF format not recognized. Supported banks: ABN AMRO (Account Balance) and N26 (Extracto bancario)."
    );
  } finally {
    await loader.destroy();
  }
}
