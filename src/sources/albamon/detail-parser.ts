import type { ParseDiagnostic, ParseResult } from "../../domain/source-contract";
import type { AlbamonDetail, AlbamonDetailFixture, AlbamonJsonLd, AlbamonWorkplaceEvidence } from "./types";

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
  if (input.metadata.contractCases?.includes("annual_salary") && (text(structured?.unitText) !== "YEAR" || structuredSalaryMinimum === null)) diagnostics.push({ severity: "warning", code: "ALBAMON_ANNUAL_SALARY_SHAPE_CHANGED", field: "baseSalary", message: "관찰된 연봉 구조가 YEAR 숫자 계약과 다릅니다." });
  const roadAddress = text(firstAddress?.streetAddress);
  const [workStartTime, workEndTime] = parseHours(visible.workHoursText);
  const coordsValid = Number.isFinite(visible.latitude) && Number.isFinite(visible.longitude);
  if ((visible.latitude != null || visible.longitude != null) && !coordsValid) diagnostics.push({ severity: "warning", code: "ALBAMON_LOCATION_SHAPE_CHANGED", field: "coordinates", message: "좌표 쌍이 완전하지 않거나 숫자가 아닙니다." });
  const workplaces: AlbamonWorkplaceEvidence[] = visible.workplaces ?? locations.flatMap((location, index) => {
    const address = location.address;
    const observedRoad = text(address?.streetAddress);
    if (!observedRoad) return [];
    return [{ originalText: index === 0 ? visible.addressText ?? observedRoad : observedRoad, roadAddress: observedRoad, city: text(address?.addressRegion), district: index === 0 ? visible.district ?? null : null, neighborhood: index === 0 ? visible.neighborhood ?? text(address?.addressLocality) : text(address?.addressLocality), nearestStation: index === 0 ? visible.nearestStation ?? null : null, latitude: index === 0 && coordsValid ? visible.latitude ?? null : null, longitude: index === 0 && coordsValid ? visible.longitude ?? null : null }];
  });
  const workplaceCount = visible.workplaceCount ?? (workplaces.length || null);
  const undecidedText = visible.addressText ?? roadAddress;
  const locationUndecided = visible.locationUndecided ?? /근무지\s*(?:면접\s*후\s*결정|추후\s*안내)|배치\s*후\s*결정|근무지역\s*협의/.test(undecidedText ?? "");
  if (locationUndecided) diagnostics.push({ severity: "info", code: "ALBAMON_LOCATION_UNDECIDED_TEXT_DETECTED", field: "addressOriginalText", message: "근무지가 결정되지 않았다는 표시 문구를 확인했습니다." });
  if (input.metadata.contractCases?.includes("multiple_locations") && workplaces.length < 2) diagnostics.push({ severity: "warning", code: "ALBAMON_MULTIPLE_WORKPLACES_UNSUPPORTED", field: "workplaces", message: "복수 근무지 계약이지만 두 개 이상의 구조화 위치를 찾지 못했습니다." });
  if (workplaceCount !== null && workplaceCount !== workplaces.length) diagnostics.push({ severity: "warning", code: "ALBAMON_WORKPLACE_COUNT_AMBIGUOUS", field: "workplaceCount", message: "표시 근무지 수와 구조화 근무지 수가 일치하지 않습니다." });
  return { value: {
    sourcePostingId, canonicalUrl: input.sourceUrl, title: text(jsonLd?.title), companyName: text(jsonLd?.hiringOrganization?.name),
    salaryText: visible.salaryText ?? null, structuredSalaryMinimum, structuredSalaryMaximum,
    employmentType: text(jsonLd?.employmentType), experienceRequirement: text(jsonLd?.experienceRequirements),
    educationRequirement: visible.educationRequirement ?? null, category: visible.category ?? null,
    addressOriginalText: visible.addressText ?? roadAddress, roadAddress, city: text(firstAddress?.addressRegion), district: visible.district ?? null,
    neighborhood: visible.neighborhood ?? text(firstAddress?.addressLocality), nearestStation: visible.nearestStation ?? null,
    latitude: coordsValid ? visible.latitude ?? null : null, longitude: coordsValid ? visible.longitude ?? null : null,
    workDaysOriginalText: visible.workDaysText ?? null, workStartTime, workEndTime, postedAt: text(jsonLd?.datePosted), expiresAt: text(jsonLd?.validThrough),
    explicitClosed: visible.explicitClosed ?? false, workplaceCount, workplaces,
    locationUndecided, capturedAt: input.metadata.capturedAt,
  }, diagnostics };
}
