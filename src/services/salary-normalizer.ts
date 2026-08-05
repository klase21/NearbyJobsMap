import type { CanonicalSalary } from "../domain/salary";

export interface SalaryNormalizationPolicy {
  monthlyHours: number;
  monthlyWorkDays: number;
  annualMonths: number;
}

export const DEFAULT_SALARY_NORMALIZATION_POLICY: SalaryNormalizationPolicy = {
  monthlyHours: 209,
  monthlyWorkDays: 22,
  annualMonths: 12,
};

export function normalizeSalary(
  salary: CanonicalSalary,
  policy: SalaryNormalizationPolicy = DEFAULT_SALARY_NORMALIZATION_POLICY,
): CanonicalSalary {
  if (salary.minimumAmount === null || salary.maximumAmount === null) return salary;
  let conversion: { factor: number; basis: string; confidence: NonNullable<CanonicalSalary["normalizationConfidence"]> };
  switch (salary.type) {
    case "hourly":
      conversion = { factor: policy.monthlyHours, basis: `시급 × 월 ${policy.monthlyHours}시간`, confidence: "medium" };
      break;
    case "daily":
      conversion = { factor: policy.monthlyWorkDays, basis: `일급 × 월 ${policy.monthlyWorkDays}일`, confidence: "low" };
      break;
    case "monthly":
      conversion = { factor: 1, basis: "월급 원문 금액", confidence: "high" };
      break;
    case "annual":
      conversion = { factor: 1 / policy.annualMonths, basis: `연봉 ÷ ${policy.annualMonths}개월`, confidence: "medium" };
      break;
    default:
      return salary;
  }
  return {
    ...salary,
    normalizedMonthlyMinimum: Math.round(salary.minimumAmount * conversion.factor),
    normalizedMonthlyMaximum: Math.round(salary.maximumAmount * conversion.factor),
    normalizationBasis: conversion.basis,
    normalizationConfidence: conversion.confidence,
  };
}
