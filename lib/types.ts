/** Shared data types — no DB dependency */

export interface MonthlySummary {
  month: string;
  grossBurn: number;
  inflows: number;
  netBurn: number;
  closingBalance: number | null;
  transactionCount: number;
}

export interface Vendor {
  vendorKey: string;
  displayAlias: string;
  category: string;
  totalSpend: number;
  monthlyAvg: number;
  monthCount: number;
  firstSeen: string;
  lastSeen: string;
  isRecurring: boolean;
  percentOfTotal: number;
}

export interface FileResult {
  name: string;
  processedRows: number;
  monthsCovered: string;
}

export interface CategorySplit {
  month: string;
  category: string;
  amount: number;
  percentage: number;
}

export interface DashboardData {
  monthlySummaries: MonthlySummary[];
  vendors: Vendor[];
  meta: {
    filesProcessed: number;
    processedRows: number;
    monthsCovered: string;
    fileResults: FileResult[];
    parseErrors?: string[];
  };
}
