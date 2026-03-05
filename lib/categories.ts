// MCC (Merchant Category Code) to category string mapping
const MCC_CATEGORIES: Record<number, string> = {
  // Software & SaaS
  5045: "Software & SaaS",
  5734: "Software & SaaS",
  7372: "Software & SaaS",
  7371: "Software & SaaS",
  7374: "Software & SaaS",

  // Cloud & Hosting
  7375: "Cloud & Hosting",
  4813: "Cloud & Hosting",
  4899: "Cloud & Hosting",

  // Advertising & Marketing
  7311: "Advertising & Marketing",
  7319: "Advertising & Marketing",
  8999: "Advertising & Marketing",

  // Professional Services
  7389: "Professional Services",
  8742: "Professional Services",
  8748: "Professional Services",
  8049: "Professional Services",
  8099: "Professional Services",

  // Legal
  8111: "Legal",

  // Banking & Finance
  6012: "Banking & Finance",
  6011: "Banking & Finance",
  6051: "Banking & Finance",
  6099: "Banking & Finance",
  6211: "Banking & Finance",
  6300: "Banking & Finance",

  // Travel & Accommodation
  4111: "Travel",
  4112: "Travel",
  4121: "Travel",
  4131: "Travel",
  4411: "Travel",
  4511: "Travel",
  7011: "Travel",
  7012: "Travel",
  7521: "Travel",
  7523: "Travel",

  // Office & Supplies
  5021: "Office & Supplies",
  5111: "Office & Supplies",
  5112: "Office & Supplies",
  5065: "Office & Supplies",

  // Utilities & Telecom
  4814: "Utilities & Telecom",
  4900: "Utilities & Telecom",
  4911: "Utilities & Telecom",
  4924: "Utilities & Telecom",
  4941: "Utilities & Telecom",

  // Payroll & Contractors (large ACH/wire transfers)
  6010: "Payroll & Contractors",

  // Food & Drink (team meals, etc.)
  5411: "Food & Drink",
  5441: "Food & Drink",
  5462: "Food & Drink",
  5812: "Food & Drink",
  5813: "Food & Drink",
  5814: "Food & Drink",
};

/**
 * Determine a category string from MCC code.
 * Falls back to amount-based heuristics for TRANSFER-type transactions.
 */
export function getCategory(
  mcc: number | null,
  type: string,
  monthlyAvg: number
): string {
  if (mcc !== null && MCC_CATEGORIES[mcc]) {
    return MCC_CATEGORIES[mcc];
  }

  // Amount heuristics for transfers without MCC
  if (type === "TRANSFER" || type === "TOPUP" || type === "ATM") {
    if (monthlyAvg > 3000) return "Payroll & Contractors";
    if (monthlyAvg >= 500) return "Professional Services";
    return "Other Transfers";
  }

  return "Other";
}

/**
 * All unique category names (for consistent ordering in charts).
 */
export const ALL_CATEGORIES = [
  "Payroll & Contractors",
  "Software & SaaS",
  "Cloud & Hosting",
  "Advertising & Marketing",
  "Professional Services",
  "Legal",
  "Banking & Finance",
  "Travel",
  "Office & Supplies",
  "Utilities & Telecom",
  "Food & Drink",
  "Other Transfers",
  "Other",
] as const;

export type Category = (typeof ALL_CATEGORIES)[number] | string;
