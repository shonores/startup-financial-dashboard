/**
 * aggregator.ts — TransactionRecord[] → SQLite (aggregates only)
 *
 * CRITICAL: This function receives the in-memory transaction array,
 * computes all aggregates, writes ONLY those aggregates to SQLite,
 * and returns. The caller must set its reference to null afterward.
 *
 * Nothing from the transaction array is persisted — no payee names,
 * no individual amounts, no IBANs, no dates of individual transactions.
 */

import { db } from "./db";
import {
  monthlySummaries,
  vendors,
  categorySplits,
  uploadLog,
} from "./schema";
import { getCategory } from "./categories";
import type { TransactionRecord } from "./parser";
import { eq, sql } from "drizzle-orm";

interface MonthData {
  grossBurn: number;
  inflows: number;
  netBurn: number;
  closingBalance: number | null;
  transactionCount: number;
}

interface VendorData {
  vendorKey: string;
  totalSpend: number;
  monthlyAmounts: Record<string, number>;
  mcc: number | null;
  type: string;
  firstSeen: string;
  lastSeen: string;
}

function detectRecurring(monthlyAmounts: Record<string, number>): boolean {
  const months = Object.keys(monthlyAmounts);
  if (months.length < 3) return false;

  const amounts = Object.values(monthlyAmounts);
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const allWithin30Pct = amounts.every((a) => Math.abs(a - avg) / avg <= 0.3);

  return allWithin30Pct;
}

// Assign human-readable aliases by category + spend rank
function assignAliases(
  vendorList: VendorData[]
): Map<string, { alias: string; category: string }> {
  const result = new Map<string, { alias: string; category: string }>();

  // Group by category
  const byCategory: Record<string, VendorData[]> = {};
  for (const v of vendorList) {
    const monthlyAvg =
      v.totalSpend / Math.max(Object.keys(v.monthlyAmounts).length, 1);
    const category = getCategory(v.mcc, v.type, monthlyAvg);
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(v);
  }

  // Category short labels for aliases
  const CATEGORY_LABELS: Record<string, string> = {
    "Payroll & Contractors": "Contractor",
    "Software & SaaS": "SaaS Tool",
    "Cloud & Hosting": "Cloud Service",
    "Advertising & Marketing": "Ad Spend",
    "Professional Services": "Service Provider",
    Legal: "Legal",
    "Banking & Finance": "Finance",
    Travel: "Travel",
    "Office & Supplies": "Office",
    "Utilities & Telecom": "Utility",
    "Food & Drink": "Team Meal",
    "Other Transfers": "Transfer",
    Other: "Vendor",
  };

  for (const [category, categoryVendors] of Object.entries(byCategory)) {
    // Sort by totalSpend descending
    categoryVendors.sort((a, b) => b.totalSpend - a.totalSpend);
    const label = CATEGORY_LABELS[category] ?? "Vendor";
    categoryVendors.forEach((v, idx) => {
      result.set(v.vendorKey, {
        alias: `${label} ${idx + 1}`,
        category,
      });
    });
  }

  return result;
}

export interface AggregatorResult {
  monthsWritten: number;
  vendorsWritten: number;
  splitsWritten: number;
}

export function aggregateAndPersist(
  transactions: TransactionRecord[],
  totalRowsInFile: number
): AggregatorResult {
  if (transactions.length === 0) {
    // Still log the upload
    db.insert(uploadLog)
      .values({
        totalRows: totalRowsInFile,
        processedRows: 0,
        monthsCovered: "no data",
        baseCurrency: "EUR",
      })
      .run();
    return { monthsWritten: 0, vendorsWritten: 0, splitsWritten: 0 };
  }

  // ─── Step 1: Wipe existing aggregates (full-refresh approach) ──────────────
  db.delete(monthlySummaries).run();
  db.delete(vendors).run();
  db.delete(categorySplits).run();

  // ─── Step 2: Group by month ─────────────────────────────────────────────────
  const byMonth = new Map<string, MonthData>();
  // Track last balance per account per month: month → accountIdx → lastBalanceEur
  // Transactions are pre-sorted by date so the last write wins correctly.
  const lastBalByMonthAccount = new Map<string, Map<number, number>>();

  for (const tx of transactions) {
    if (!byMonth.has(tx.month)) {
      byMonth.set(tx.month, {
        grossBurn: 0,
        inflows: 0,
        netBurn: 0,
        closingBalance: null,
        transactionCount: 0,
      });
    }
    const m = byMonth.get(tx.month)!;
    m.transactionCount++;

    if (tx.isOutflow) {
      m.grossBurn += Math.abs(tx.amountEur);
    } else {
      m.inflows += tx.amountEur;
    }

    // Track last EUR balance seen for this account in this month
    if (tx.balanceEur !== null) {
      if (!lastBalByMonthAccount.has(tx.month)) {
        lastBalByMonthAccount.set(tx.month, new Map());
      }
      lastBalByMonthAccount.get(tx.month)!.set(tx.accountIdx, tx.balanceEur);
    }
  }

  for (const [month, m] of byMonth) {
    m.netBurn = m.grossBurn - m.inflows;
    // Sum closing balances across all accounts for this month
    const accountBals = lastBalByMonthAccount.get(month);
    if (accountBals && accountBals.size > 0) {
      m.closingBalance = [...accountBals.values()].reduce((a, b) => a + b, 0);
    }
  }

  // Write monthly summaries
  for (const [month, m] of byMonth) {
    db.insert(monthlySummaries)
      .values({
        month,
        grossBurn: Math.round(m.grossBurn * 100) / 100,
        inflows: Math.round(m.inflows * 100) / 100,
        netBurn: Math.round(m.netBurn * 100) / 100,
        closingBalance: m.closingBalance
          ? Math.round(m.closingBalance * 100) / 100
          : null,
        transactionCount: m.transactionCount,
      })
      .run();
  }

  // ─── Step 3: Group by vendorKey ─────────────────────────────────────────────
  const byVendor = new Map<string, VendorData>();

  for (const tx of transactions) {
    if (!tx.isOutflow) continue; // only track expenses

    if (!byVendor.has(tx.vendorKey)) {
      byVendor.set(tx.vendorKey, {
        vendorKey: tx.vendorKey,
        totalSpend: 0,
        monthlyAmounts: {},
        mcc: tx.mcc,
        type: tx.type,
        firstSeen: tx.month,
        lastSeen: tx.month,
      });
    }
    const v = byVendor.get(tx.vendorKey)!;
    const spend = Math.abs(tx.amountEur);
    v.totalSpend += spend;
    v.monthlyAmounts[tx.month] = (v.monthlyAmounts[tx.month] ?? 0) + spend;
    if (tx.month < v.firstSeen) v.firstSeen = tx.month;
    if (tx.month > v.lastSeen) v.lastSeen = tx.month;
    // Use first non-null MCC we encounter
    if (v.mcc === null && tx.mcc !== null) v.mcc = tx.mcc;
  }

  const vendorList = [...byVendor.values()].sort(
    (a, b) => b.totalSpend - a.totalSpend
  );
  const totalAllSpend = vendorList.reduce((s, v) => s + v.totalSpend, 0);

  const aliasMap = assignAliases(vendorList);

  for (const v of vendorList) {
    const months = Object.keys(v.monthlyAmounts);
    const monthCount = months.length;
    const monthlyAvg = v.totalSpend / Math.max(monthCount, 1);
    const aliasInfo = aliasMap.get(v.vendorKey);
    const category = aliasInfo?.category ?? getCategory(v.mcc, v.type, monthlyAvg);
    const displayAlias = aliasInfo?.alias ?? "Vendor";
    const percentOfTotal =
      totalAllSpend > 0 ? (v.totalSpend / totalAllSpend) * 100 : 0;
    const isRecurring = detectRecurring(v.monthlyAmounts);

    db.insert(vendors)
      .values({
        vendorKey: v.vendorKey,
        displayAlias,
        category,
        totalSpend: Math.round(v.totalSpend * 100) / 100,
        monthlyAvg: Math.round(monthlyAvg * 100) / 100,
        monthCount,
        firstSeen: v.firstSeen,
        lastSeen: v.lastSeen,
        isRecurring,
        percentOfTotal: Math.round(percentOfTotal * 100) / 100,
      })
      .run();
  }

  // ─── Step 4: Category splits per month ─────────────────────────────────────
  // month → category → amount
  const splitsMap = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    if (!tx.isOutflow) continue;

    const vendorInfo = byVendor.get(tx.vendorKey);
    const monthlyAvg = vendorInfo
      ? vendorInfo.totalSpend / Math.max(Object.keys(vendorInfo.monthlyAmounts).length, 1)
      : Math.abs(tx.amountEur);
    const category = getCategory(tx.mcc, tx.type, monthlyAvg);

    if (!splitsMap.has(tx.month)) splitsMap.set(tx.month, new Map());
    const monthMap = splitsMap.get(tx.month)!;
    monthMap.set(category, (monthMap.get(category) ?? 0) + Math.abs(tx.amountEur));
  }

  let splitsWritten = 0;
  for (const [month, catMap] of splitsMap) {
    const monthGrossBurn = byMonth.get(month)?.grossBurn ?? 1;
    for (const [category, amount] of catMap) {
      const percentage = monthGrossBurn > 0 ? (amount / monthGrossBurn) * 100 : 0;
      db.insert(categorySplits)
        .values({
          month,
          category,
          amount: Math.round(amount * 100) / 100,
          percentage: Math.round(percentage * 100) / 100,
        })
        .run();
      splitsWritten++;
    }
  }

  // ─── Step 5: Log the upload ─────────────────────────────────────────────────
  const allMonths = [...byMonth.keys()].sort();
  const monthsCovered =
    allMonths.length > 0
      ? `${allMonths[0]} to ${allMonths[allMonths.length - 1]}`
      : "no data";

  db.insert(uploadLog)
    .values({
      totalRows: totalRowsInFile,
      processedRows: transactions.length,
      monthsCovered,
      baseCurrency: "EUR",
    })
    .run();

  return {
    monthsWritten: byMonth.size,
    vendorsWritten: vendorList.length,
    splitsWritten,
  };
}
