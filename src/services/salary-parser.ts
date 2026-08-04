import type { CanonicalSalary, SalaryType } from "../domain/salary.js";

const TYPE_PATTERNS: Array<[RegExp, SalaryType]> = [
  [/시급|시간급/, "hourly"],
  [/일급/, "daily"],
  [/주급/, "weekly"],
  [/월급|(?:^|\s)월\s*/, "monthly"],
  [/연봉|(?:^|\s)연\s*/, "annual"],
  [/건별|건당/, "per_task"],
];

function amountFromToken(token: string, inheritedManwon: boolean): number | null {
  const compact = token.replace(/,/g, "").replace(/\s/g, "");
  const match = compact.match(/(\d+(?:\.\d+)?)(만)?(?:원)?/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * (match[2] || inheritedManwon ? 10_000 : 1));
}

function parseAmounts(text: string): [number | null, number | null] {
  const range = text.match(/([\d,.]+\s*만?\s*원?)\s*(?:~|～|-|–|에서)\s*([\d,.]+\s*만?\s*원?)/);
  if (range?.[1] && range[2]) {
    const inheritManwon = /만/.test(range[1]) || /만/.test(range[2]);
    return [amountFromToken(range[1], inheritManwon), amountFromToken(range[2], inheritManwon)];
  }
  const single = text.match(/[\d,.]+\s*만?\s*원?/);
  const value = single ? amountFromToken(single[0], false) : null;
  return [value, value];
}

export function parseSalary(originalText: string): CanonicalSalary {
  const text = originalText.replace(/\s+/g, " ").trim();
  const negotiable = /면접\s*후\s*결정|협의|협상/.test(text);
  const companyPolicy = /회사\s*내규|내규에\s*따름/.test(text);
  const includesIncentive = /인센티브|성과급/.test(text) ? true : null;
  let type: SalaryType = companyPolicy ? "company_policy" : negotiable ? "negotiable" : "unknown";
  for (const [pattern, candidate] of TYPE_PATTERNS) {
    if (pattern.test(text)) {
      type = candidate;
      break;
    }
  }
  if (includesIncentive && /기본급/.test(text)) type = "mixed";
  const [minimumAmount, maximumAmount] = companyPolicy && !/\d/.test(text) ? [null, null] : parseAmounts(text);
  return {
    originalText,
    type,
    minimumAmount,
    maximumAmount,
    currency: minimumAmount === null ? null : "KRW",
    negotiable,
    includesIncentive,
    normalizedMonthlyMinimum: null,
    normalizedMonthlyMaximum: null,
    normalizationBasis: null,
    normalizationConfidence: null,
  };
}
