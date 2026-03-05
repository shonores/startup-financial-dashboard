/**
 * aggregator.ts — TransactionRecord[] → in-memory aggregates
 *
 * Pure function: computes monthly summaries and vendor roll-ups
 * from the transaction array and returns them. Nothing is persisted.
 */

import { getCategory } from "./categories";
import type { TransactionRecord } from "./parser";
import type { MonthlySummary, Vendor } from "./types";

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
  return amounts.every((a) => Math.abs(a - avg) / avg <= 0.3);
}

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

function assignAliases(
  vendorList: VendorData[]
): Map<string, { alias: string; category: string }> {
  const result = new Map<string, { alias: string; category: string }>();
  const byCategory: Record<string, VendorData[]> = {};

  for (const v of vendorList) {
    const monthlyAvg =
      v.totalSpend / Math.max(Object.keys(v.monthlyAmounts).length, 1);
    const category = getCategory(v.mcc, v.type, monthlyAvg);
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(v);
  }

  for (const [category, list] of Object.entries(byCategory)) {
    list.sort((a, b) => b.totalSpend - a.totalSpend);
    const label = CATEGORY_LABELS[category] ?? "Vendor";
    list.forEach((v, idx) => {
      result.set(v.vendorKey, { alias: `${label} ${idx + 1}`, category });
    });
  }

  return result;
}

export interface AggregateResult {
  monthlySummaries: MonthlySummary[];
  vendors: Vendor[];
}

export function aggregate(transactions: TransactionRecord[]): AggregateResult {
  if (transactions.length === 0) {
    return { monthlySummaries: [], vendors: [] };
  }

  // ── Monthly summaries ──────────────────────────────────────────────────────
  const byMonth = new Map<
    string,
    {
      grossBurn: number;
      inflows: number;
      transactionCount: number;
      closingBalance: number | null;
    }
  >();
  const lastBalByMonthAccount = new Map<string, Map<number, number>>();

  for (const tx of transactions) {
    if (!byMonth.has(tx.month)) {
      byMonth.set(tx.month, {
        grossBurn: 0,
        inflows: 0,
        transactionCount: 0,
        closingBalance: null,
      });
    }
    const m = byMonth.get(tx.month)!;
    m.transactionCount++;
    if (tx.isOutflow) {
      m.grossBurn += Math.abs(tx.amountEur);
    } else {
      m.inflows += tx.amountEur;
    }
    if (tx.balanceEur !== null) {
      if (!lastBalByMonthAccount.has(tx.month)) {
        lastBalByMonthAccount.set(tx.month, new Map());
      }
      lastBalByMonthAccount.get(tx.month)!.set(tx.accountIdx, tx.balanceEur);
    }
  }

  const monthlySummaries: MonthlySummary[] = [];
  for (const [month, m] of [...byMonth.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const accountBals = lastBalByMonthAccount.get(month);
    const closingBalance =
      accountBals && accountBals.size > 0
        ? [...accountBals.values()].reduce((a, b) => a + b, 0)
        : null;
    monthlySummaries.push({
      month,
      grossBurn: Math.round(m.grossBurn * 100) / 100,
      inflows: Math.round(m.inflows * 100) / 100,
      netBurn: Math.round((m.grossBurn - m.inflows) * 100) / 100,
      closingBalance: closingBalance
        ? Math.round(closingBalance * 100) / 100
        : null,
      transactionCount: m.transactionCount,
    });
  }

  // ── Vendors ────────────────────────────────────────────────────────────────
  const byVendor = new Map<string, VendorData>();

  for (const tx of transactions) {
    if (!tx.isOutflow) continue;
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
    if (v.mcc === null && tx.mcc !== null) v.mcc = tx.mcc;
  }

  const vendorList = [...byVendor.values()].sort(
    (a, b) => b.totalSpend - a.totalSpend
  );
  const totalAllSpend = vendorList.reduce((s, v) => s + v.totalSpend, 0);
  const aliasMap = assignAliases(vendorList);

  const vendors: Vendor[] = vendorList.map((v) => {
    const monthCount = Object.keys(v.monthlyAmounts).length;
    const monthlyAvg = v.totalSpend / Math.max(monthCount, 1);
    const aliasInfo = aliasMap.get(v.vendorKey);
    const category =
      aliasInfo?.category ?? getCategory(v.mcc, v.type, monthlyAvg);
    return {
      vendorKey: v.vendorKey,
      displayAlias: aliasInfo?.alias ?? "Vendor",
      category,
      totalSpend: Math.round(v.totalSpend * 100) / 100,
      monthlyAvg: Math.round(monthlyAvg * 100) / 100,
      monthCount,
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
      isRecurring: detectRecurring(v.monthlyAmounts),
      percentOfTotal:
        totalAllSpend > 0
          ? Math.round((v.totalSpend / totalAllSpend) * 10000) / 100
          : 0,
    };
  });

  return { monthlySummaries, vendors };
}
