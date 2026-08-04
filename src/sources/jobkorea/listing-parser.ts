import type { ParseDiagnostic, SourceListingPage } from "../../domain/source-contract.js";
import type { JobKoreaListing, JobKoreaListingFixture, JobKoreaListingFixtureItem } from "./types.js";

function parseItem(item: JobKoreaListingFixtureItem, capturedAt: string, index: number) {
  const diagnostics: ParseDiagnostic[] = [];
  if (!item.sourcePostingId) diagnostics.push({ severity: "error", code: "SOURCE_POSTING_ID_MISSING", field: "sourcePostingId", message: `잡코리아 목록 ${index}번 항목의 ID가 없습니다.` });
  if (!item.title) diagnostics.push({ severity: "error", code: "JOBKOREA_LISTING_TITLE_MISSING", field: "title", message: `잡코리아 목록 ${index}번 항목의 제목이 없습니다.` });
  if (!item.companyName) diagnostics.push({ severity: "error", code: "JOBKOREA_LISTING_COMPANY_MISSING", field: "companyName", message: `잡코리아 목록 ${index}번 항목의 회사명이 없습니다.` });
  if (!item.sourcePostingId || !item.title || !item.companyName || !item.sourceUrl) return { value: null, diagnostics };
  const value: JobKoreaListing = {
    sourcePostingId: item.sourcePostingId,
    sourceUrl: item.sourceUrl,
    title: item.title,
    companyName: item.companyName,
    salaryText: item.salaryText ?? null,
    regionText: item.regionText ?? null,
    categories: item.categories ?? [],
    employmentTypes: item.employmentTypes ?? [],
    experienceRequirement: item.experienceRequirement ?? null,
    educationRequirement: item.educationRequirement ?? null,
    postedAt: item.postedAt ?? null,
    deadlineText: item.deadlineText ?? null,
    promoted: item.promoted ?? null,
    capturedAt,
  };
  return { value, diagnostics };
}

export function parseJobKoreaListing(input: JobKoreaListingFixture): SourceListingPage<JobKoreaListing> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { items: [], diagnostics: [{ severity: "error", code: "JOBKOREA_LISTING_ITEMS_EMPTY", field: "items", message: "잡코리아 목록 항목이 비어 있습니다." }] };
  }
  return { items: input.items.map((item, index) => parseItem(item, input.metadata.capturedAt, index)), diagnostics: [] };
}
