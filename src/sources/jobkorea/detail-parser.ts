import type { ParseDiagnostic, ParseResult } from "../../domain/source-contract";
import type { JobKoreaDetail, JobKoreaDetailFixture, JobKoreaJsonLd, JobKoreaWorkplaceEvidence } from "./types";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findJobPosting(blocks: unknown[] | undefined): JobKoreaJsonLd | null {
  if (!blocks) return null;
  for (const block of blocks) {
    const values = Array.isArray(block) ? block : [block];
    for (const value of values) {
      if (value && typeof value === "object" && (value as { "@type"?: unknown })["@type"] === "JobPosting") return value as JobKoreaJsonLd;
    }
  }
  return null;
}

function parseHours(value: string | null | undefined): [string | null, string | null] {
  const match = value?.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
  return [match?.[1] ?? null, match?.[2] ?? null];
}

export function parseJobKoreaDetail(input: JobKoreaDetailFixture): ParseResult<JobKoreaDetail> {
  const diagnostics: ParseDiagnostic[] = [];
  const jsonLd = findJobPosting(input.jsonLdBlocks);
  if (!jsonLd) diagnostics.push({ severity: "warning", code: "JOBKOREA_DETAIL_JSONLD_MISSING", field: "jsonLdBlocks", message: "JobPosting JSON-LD를 찾지 못했습니다. 표시 필드만 사용합니다." });
  const visible = input.visible ?? {};
  const sourcePostingId = text(jsonLd?.identifier?.value) ?? input.sourceUrl.match(/GI_Read\/(\d+)/)?.[1] ?? null;
  if (!sourcePostingId) diagnostics.push({ severity: "error", code: "SOURCE_POSTING_ID_MISSING", field: "sourcePostingId", message: "잡코리아 상세 공고 ID를 찾지 못했습니다." });
  const structured = jsonLd?.baseSalary?.value;
  const structuredMinimum = number(structured?.minValue) ?? number(structured?.value);
  const structuredMaximum = number(structured?.maxValue) ?? number(structured?.value);
  if (jsonLd?.baseSalary && structuredMinimum === null) diagnostics.push({ severity: "warning", code: "JOBKOREA_SALARY_SHAPE_CHANGED", field: "baseSalary", message: "구조화 급여의 숫자 형태를 해석하지 못했습니다." });
  if (input.metadata.contractCases?.includes("annual_salary") && (text(structured?.unitText) !== "YEAR" || structuredMinimum === null)) diagnostics.push({ severity: "warning", code: "JOBKOREA_ANNUAL_SALARY_SHAPE_CHANGED", field: "baseSalary", message: "관찰된 연봉 구조가 YEAR 숫자 계약과 다릅니다." });
  const jsonLocations = jsonLd?.jobLocation ? (Array.isArray(jsonLd.jobLocation) ? jsonLd.jobLocation : [jsonLd.jobLocation]) : [];
  const jsonAddress = text(jsonLocations[0]?.address?.streetAddress);
  const addressOriginalText = visible.addressText ?? jsonAddress;
  const workplaces: JobKoreaWorkplaceEvidence[] = visible.workplaces ?? jsonLocations.flatMap((location, index) => {
    const roadAddress = text(location.address?.streetAddress);
    if (!roadAddress) return [];
    return [{ originalText: roadAddress, roadAddress, city: index === 0 ? visible.city ?? text(location.address?.addressRegion) : text(location.address?.addressRegion), district: index === 0 ? visible.district ?? null : null, neighborhood: index === 0 ? visible.neighborhood ?? text(location.address?.addressLocality) : text(location.address?.addressLocality), nearestStation: index === 0 ? visible.nearestStation ?? null : null, latitude: null, longitude: null }];
  });
  const workplaceCount = visible.workplaceCount ?? (workplaces.length || null);
  const locationUndecided = visible.locationUndecided ?? /근무지\s*(?:면접\s*후\s*결정|추후\s*안내)|배치\s*후\s*결정|근무지역\s*협의/.test(addressOriginalText ?? "");
  if (locationUndecided) diagnostics.push({ severity: "info", code: "JOBKOREA_LOCATION_UNDECIDED_TEXT_DETECTED", field: "addressOriginalText", message: "근무지가 결정되지 않았다는 표시 문구를 확인했습니다." });
  if (input.metadata.contractCases?.includes("multiple_locations") && workplaces.length < 2) diagnostics.push({ severity: "warning", code: "JOBKOREA_MULTIPLE_WORKPLACES_UNSUPPORTED", field: "workplaces", message: "복수 근무지 계약이지만 두 개 이상의 구조화 위치를 찾지 못했습니다." });
  if (workplaceCount !== null && workplaceCount !== workplaces.length) diagnostics.push({ severity: "warning", code: "JOBKOREA_WORKPLACE_COUNT_AMBIGUOUS", field: "workplaceCount", message: "표시 근무지 수와 구조화 근무지 수가 일치하지 않습니다." });
  if (workplaceCount && workplaceCount > 1 && workplaces.some((place) => place.latitude !== null || place.longitude !== null)) diagnostics.push({ severity: "warning", code: "JOBKOREA_MULTIPLE_LOCATION_COORDINATE_AMBIGUOUS", field: "workplaces", message: "복수 근무지 좌표는 위치별 쌍으로만 사용할 수 있습니다." });
  const [workStartTime, workEndTime] = parseHours(visible.workHoursText);
  return {
    value: {
      sourcePostingId,
      canonicalUrl: text(jsonLd?.url) ?? input.sourceUrl,
      title: text(jsonLd?.title),
      companyName: text(jsonLd?.hiringOrganization?.name),
      salaryText: visible.salaryText ?? null,
      structuredSalaryMinimum: structuredMinimum,
      structuredSalaryMaximum: structuredMaximum,
      employmentType: text(jsonLd?.employmentType),
      experienceRequirement: text(jsonLd?.experienceRequirements),
      educationRequirement: text(jsonLd?.educationRequirements),
      addressOriginalText,
      roadAddress: jsonAddress,
      city: visible.city ?? null,
      district: visible.district ?? null,
      neighborhood: visible.neighborhood ?? null,
      nearestStation: visible.nearestStation ?? null,
      workDaysOriginalText: visible.workDaysText ?? null,
      workStartTime,
      workEndTime,
      postedAt: text(jsonLd?.datePosted),
      expiresAt: text(jsonLd?.validThrough),
      explicitClosed: visible.explicitClosed ?? false,
      workplaces,
      workplaceCount,
      locationUndecided,
      capturedAt: input.metadata.capturedAt,
    },
    diagnostics,
  };
}
