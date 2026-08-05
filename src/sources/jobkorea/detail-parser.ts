import type { ParseDiagnostic, ParseResult } from "../../domain/source-contract";
import type { JobKoreaDetail, JobKoreaDetailFixture, JobKoreaJsonLd } from "./types";

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
  const jsonAddress = text(jsonLd?.jobLocation?.address?.streetAddress);
  const addressOriginalText = visible.addressText ?? jsonAddress;
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
      workplaceCount: visible.workplaceCount ?? null,
      capturedAt: input.metadata.capturedAt,
    },
    diagnostics,
  };
}
