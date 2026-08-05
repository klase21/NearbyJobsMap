import type { CanonicalJob } from "../domain/canonical-job";

export interface DuplicateAssessment {
  classification: "exact" | "probable" | "related" | "different" | "unknown";
  score: number;
  reasons: string[];
}

function normalizeText(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/(?:주식회사|\(주\)|㈜)/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

function normalizeUrl(value: string | null): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return value.split(/[?#]/, 1)[0]?.replace(/\/$/, "").toLowerCase() ?? "";
  }
}

export function assessDuplicate(a: CanonicalJob, b: CanonicalJob): DuplicateAssessment {
  if (a.source === b.source && a.sourcePostingId && a.sourcePostingId === b.sourcePostingId) {
    return { classification: "exact", score: 1, reasons: ["동일 소스 posting ID 일치"] };
  }
  const aUrl = normalizeUrl(a.canonicalUrl ?? a.sourceUrl);
  const bUrl = normalizeUrl(b.canonicalUrl ?? b.sourceUrl);
  if (a.source === b.source && aUrl && aUrl === bUrl) {
    return { classification: "exact", score: 1, reasons: ["동일 소스 canonical URL 일치"] };
  }

  let score = 0;
  let availableWeight = 0;
  const reasons: string[] = [];
  const compare = (weight: number, condition: boolean, reason: string, available = true): void => {
    if (!available) return;
    availableWeight += weight;
    if (condition) {
      score += weight;
      reasons.push(reason);
    }
  };
  const companyA = normalizeText(a.normalizedCompanyName ?? a.companyName);
  const companyB = normalizeText(b.normalizedCompanyName ?? b.companyName);
  const titleA = normalizeText(a.title);
  const titleB = normalizeText(b.title);
  compare(0.25, companyA === companyB, "회사명 일치", Boolean(companyA && companyB));
  compare(0.25, titleA === titleB, "제목 일치", Boolean(titleA && titleB));
  compare(0.2, normalizeText(a.roadAddress) === normalizeText(b.roadAddress), "도로명 주소 일치", Boolean(a.roadAddress && b.roadAddress));
  compare(0.1, a.district === b.district && a.neighborhood === b.neighborhood, "구·동 일치", Boolean(a.district && b.district));
  compare(0.1, a.salary.type === b.salary.type && a.salary.minimumAmount === b.salary.minimumAmount && a.salary.maximumAmount === b.salary.maximumAmount, "급여 범위 일치", a.salary.minimumAmount !== null && b.salary.minimumAmount !== null);
  compare(0.05, a.workStartTime === b.workStartTime && a.workEndTime === b.workEndTime, "근무시간 일치", Boolean(a.workStartTime && b.workStartTime));
  compare(0.05, a.employmentTypes.some((type) => b.employmentTypes.includes(type)), "고용형태 교집합", a.employmentTypes.length > 0 && b.employmentTypes.length > 0);
  if (availableWeight === 0) return { classification: "unknown", score: 0, reasons: ["비교 가능한 신호 부족"] };
  const normalizedScore = Number((score / availableWeight).toFixed(3));
  const classification = normalizedScore >= 0.72 ? "probable" : normalizedScore >= 0.42 ? "related" : "different";
  return { classification, score: normalizedScore, reasons: reasons.length ? reasons : ["일치 신호 없음"] };
}
