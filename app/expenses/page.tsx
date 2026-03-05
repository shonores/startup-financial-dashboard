"use client";

import NavBar from "@/components/NavBar";
import CategoryPieChart from "@/components/charts/CategoryPieChart";
import { useEffect, useState } from "react";
import type { Vendor, CategorySplit } from "@/lib/schema";

interface VendorsResponse {
  vendors: Vendor[];
  categorySplits: CategorySplit[];
  latestCategorySplits: CategorySplit[];
  alerts: Array<{ alias: string; category: string | null; issue: string }>;
  duplicateAlerts: Array<{
    category: string;
    count: number;
    aliases: string[];
    issue: string;
  }>;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ExpensesPage() {
  const [data, setData] = useState<VendorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vendors?limit=100")
      .then((r) => r.json())
      .then((d: VendorsResponse) => setData(d))
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const vendors = data?.vendors ?? [];
  const latestSplits = data?.latestCategorySplits ?? [];
  const allAlerts = [...(data?.alerts ?? []), ...(data?.duplicateAlerts?.map((a) => ({
    alias: `${a.count} vendors`,
    category: a.category,
    issue: a.issue,
  })) ?? [])];

  const top10 = vendors.slice(0, 10);
  const filteredVendors = selectedCategory
    ? vendors.filter((v) => v.category === selectedCategory)
    : top10;

  const allCategories = [...new Set(vendors.map((v) => v.category ?? "Other"))];

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100">Expenses</h1>
          <p className="text-slate-400 text-sm mt-1">
            Vendor breakdown and category analysis
          </p>
        </div>

        {vendors.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-slate-400">No expense data yet — upload a CSV first.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Alerts */}
            {allAlerts.length > 0 && (
              <div className="card border-yellow-800">
                <h2 className="text-sm font-semibold text-yellow-400 mb-3">
                  Alerts ({allAlerts.length})
                </h2>
                <div className="space-y-2">
                  {allAlerts.slice(0, 5).map((a, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className="text-yellow-500 mt-0.5">⚠</span>
                      <div>
                        <span className="text-slate-200 font-medium">
                          {a.alias}
                        </span>
                        {a.category && (
                          <span className="text-slate-500 ml-1">
                            ({a.category})
                          </span>
                        )}
                        <span className="text-slate-400 ml-2">— {a.issue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Charts + Table layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Pie chart */}
              <div className="card lg:col-span-1">
                <h2 className="text-sm font-semibold text-slate-300 mb-2">
                  Category Breakdown
                </h2>
                <p className="text-xs text-slate-500 mb-4">Latest month</p>
                <CategoryPieChart splits={latestSplits} />

                {/* Category filter buttons */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${
                      selectedCategory === null
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    All
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() =>
                        setSelectedCategory(cat === selectedCategory ? null : cat)
                      }
                      className={`text-xs px-2 py-1 rounded-full transition-colors ${
                        selectedCategory === cat
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vendor table */}
              <div className="card lg:col-span-2">
                <h2 className="text-sm font-semibold text-slate-300 mb-4">
                  {selectedCategory ? `${selectedCategory} Vendors` : "Top 10 Vendors"}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800">
                        <th className="text-left pb-3 pr-4">#</th>
                        <th className="text-left pb-3 pr-4">Alias</th>
                        <th className="text-left pb-3 pr-4">Category</th>
                        <th className="text-right pb-3 pr-4">Monthly Avg</th>
                        <th className="text-right pb-3 pr-4">Total</th>
                        <th className="text-right pb-3 pr-4">% Spend</th>
                        <th className="text-center pb-3">Recurring</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map((v, i) => (
                        <tr
                          key={v.id}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3 pr-4 text-slate-500">{i + 1}</td>
                          <td className="py-3 pr-4 font-medium text-slate-100">
                            {v.displayAlias}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="badge badge-blue">
                              {v.category ?? "Other"}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-slate-300">
                            {formatCurrency(v.monthlyAvg ?? 0)}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-slate-100 font-medium">
                            {formatCurrency(v.totalSpend ?? 0)}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-slate-400">
                            {(v.percentOfTotal ?? 0).toFixed(1)}%
                          </td>
                          <td className="py-3 text-center">
                            {v.isRecurring ? (
                              <span className="text-green-400">✓</span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-600 mt-3">
                  Vendor names are anonymized. &quot;Contractor 1&quot; etc. are aliases
                  assigned by category and spend rank — no real names are stored.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
