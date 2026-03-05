import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "collaborator", "viewer"] })
    .notNull()
    .default("viewer"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const uploadLog = sqliteTable("upload_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadedAt: text("uploaded_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  totalRows: integer("total_rows").notNull(),
  processedRows: integer("processed_rows").notNull(),
  monthsCovered: text("months_covered").notNull(), // "2022-11 to 2026-02"
  baseCurrency: text("base_currency").notNull().default("EUR"),
});

export const monthlySummaries = sqliteTable("monthly_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull().unique(), // "2025-12"
  grossBurn: real("gross_burn").notNull(), // total outflows (positive number)
  inflows: real("inflows").notNull(), // total inflows
  netBurn: real("net_burn").notNull(), // gross - inflows
  closingBalance: real("closing_balance"), // last balance of month
  transactionCount: integer("transaction_count"), // how many txns that month
});

export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorKey: text("vendor_key").notNull().unique(), // normalized grouping key
  displayAlias: text("display_alias").notNull(), // "Contractor 1", "SaaS Tool 3"
  category: text("category"), // "Payroll & Contractors"
  totalSpend: real("total_spend").default(0),
  monthlyAvg: real("monthly_avg").default(0),
  monthCount: integer("month_count").default(0), // months active
  firstSeen: text("first_seen"), // "2023-01"
  lastSeen: text("last_seen"), // "2026-02"
  isRecurring: integer("is_recurring", { mode: "boolean" }).default(false),
  percentOfTotal: real("percent_of_total").default(0), // e.g., 12.5
});

export const categorySplits = sqliteTable("category_splits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull(), // "2025-12"
  category: text("category").notNull(), // "Software & SaaS"
  amount: real("amount").notNull(), // total for that category
  percentage: real("percentage").notNull(), // % of month's gross burn
});

export const scenarios = sqliteTable("scenarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  monthlySavings: real("monthly_savings").default(0),
  monthlyIncrease: real("monthly_increase").default(0),
  oneTimeCash: real("one_time_cash").default(0),
  revenueGrowthPct: real("revenue_growth_pct").default(0),
  resultRunwayMonths: real("result_runway_months"),
  resultZeroCashDate: text("result_zero_cash_date"),
  resultRunwayDelta: real("result_runway_delta"), // vs baseline
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Type exports for use throughout the app
export type User = typeof users.$inferSelect;
export type MonthlySummary = typeof monthlySummaries.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type CategorySplit = typeof categorySplits.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type UploadLog = typeof uploadLog.$inferSelect;
