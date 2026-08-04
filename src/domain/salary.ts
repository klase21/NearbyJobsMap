export type SalaryType =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "annual"
  | "per_task"
  | "negotiable"
  | "company_policy"
  | "mixed"
  | "unknown";

export interface CanonicalSalary {
  originalText: string;
  type: SalaryType;
  minimumAmount: number | null;
  maximumAmount: number | null;
  currency: "KRW" | null;
  negotiable: boolean;
  includesIncentive: boolean | null;
  normalizedMonthlyMinimum: number | null;
  normalizedMonthlyMaximum: number | null;
  normalizationBasis: string | null;
  normalizationConfidence: "high" | "medium" | "low" | null;
}
