import type { ParseDiagnostic, ParseResult } from "../../domain/source-contract.js";
import type { AlbamonDetail, AlbamonDetailFixture, AlbamonJsonLd } from "./types.js";

function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function findJobPosting(blocks: unknown[] | undefined): AlbamonJsonLd | null {
  for (const block of blocks ?? []) {
    for (const value of Array.isArray(block) ? block : [block]) {
      if (value && typeof value === "object" && (value as { "@type"?: unknown })["@type"] === "JobPosting") return value as AlbamonJsonLd;
    }
  }
  return null;
}
function parseHours(value: string | null | undefined): [string | null, string | null] {
  const match = value?.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
  return [match?.[1] ?? null, match?.[2] ?? null];
}

export function parseAlbamonDetail(input: AlbamonDetailFixture): ParseResult<AlbamonDetail> {
  const diagnostics: ParseDiagnostic[] = [];
  const jsonLd = findJobPosting(input.jsonLdBlocks);
  if (!jsonLd) diagnostics.push({ severity: "warning", code: "ALBAMON_DETAIL_JSONLD_MISSING", field: "jsonLdBlocks", message: "JobPosting JSON-LD를 찾지 못했습니다." });
  const sourcePostingId = input.sourceUrl.match(/\/jobs\/detail\/(\d+)/)?.[1] ?? null;
  if (!sourcePostingId) diagnostics.push({ severity: "error", code: "SOURCE_POSTING_ID_MISSING", field: "sourcePostingId", message: "알바몬 상세 공고 ID를 찾지 못했습니다." });
  const locations = jsonLd?.jobLocation ? (Array.isArray(jsonLd.jobLocation) ? jsonLd.jobLocation : [jsonLd.jobLocation]) : [];
  const firstAddress = locations[0]?.address;
  if (jsonLd?.jobLocation && locations.some((location) => !location.address || typeof location.address !== "object")) diagnostics.push({ severity: "warning", code: "ALBAMON_LOCATION_SHAPE_CHANGED", field: "jobLocation", message: "알바몬 위치 필드 형태가 예상 계약과 다릅니다." });
  const visible = input.visible ?? {};
  const structured = jsonLd?.baseSalary?.value;
  const structuredSalaryMinimum = number(structured?.minValue) ?? number(structured?.value);
  const structuredSalaryMaximum = number(structured?.maxValue) ?? number(structured?.value);
  if (jsonLd?.baseSalary && structuredSalaryMinimum === null) diagnostics.push({ severity: "warning", code: "ALBAMON_SALARY_SHAPE_CHANGED", field: "baseSalary", message: "구조화 급여의 숫자 형태를 해석하지 못했습니다." });
  const roadAddress = text(firstAddress?.streetAddress);
  const [workStartTime, workEndTime] = parseHours(visible.workHoursText);
  const coordsValid = Number.isFinite(visible.latitude) && Number.isFinite(visible.longitude);
  if ((visible.latitude != null || visible.longitude != null) && !coordsValid) diagnostics.push({ severity: "warning", code: "ALBAMON_LOCATION_SHAPE_CHANGED", field: "coordinates", message: "좌표 쌍이 완전하지 않거나 숫자가 아닙니다." });
  return { value: {
    sourcePostingId, canonicalUrl: input.sourceUrl, title: text(jsonLd?.title), companyName: text(jsonLd?.hiringOrganization?.name),
    salaryText: visible.salaryText ?? null, structuredSalaryMinimum, structuredSalaryMaximum,
    employmentType: text(jsonLd?.employmentType), experienceRequirement: text(jsonLd?.experienceRequirements),
    educationRequirement: visible.educationRequirement ?? null, category: visible.category ?? null,
    addressOriginalText: visible.addressText ?? roadAddress, roadAddress, city: text(firstAddress?.addressRegion), district: visible.district ?? null,
    neighborhood: visible.neighborhood ?? text(firstAddress?.addressLocality), nearestStation: visible.nearestStation ?? null,
    latitude: coordsValid ? visible.latitude ?? null : null, longitude: coordsValid ? visible.longitude ?? null : null,
    workDaysOriginalText: visible.workDaysText ?? null, workStartTime, workEndTime, postedAt: text(jsonLd?.datePosted), expiresAt: text(jsonLd?.validThrough),
    explicitClosed: visible.explicitClosed ?? false, workplaceCount: visible.workplaceCount ?? (locations.length || null),
    locationUndecided: visible.locationUndecided ?? false, capturedAt: input.metadata.capturedAt,
  }, diagnostics };
}
