import { inspectFixtureSafety } from "../../../services/fixture-loader";
import type { JobKoreaDetailFixture, JobKoreaJsonLd, JobKoreaListingFixture, JobKoreaListingFixtureItem } from "../types";
import { JobKoreaTransportError } from "./jobkorea-error";
import { normalizeJobKoreaUrl, sourcePostingIdFromUrl } from "./jobkorea-url-policy";

export const JOBKOREA_SANITIZER_VERSION = "jobkorea-minimal-v1";
export const JOBKOREA_PARSER_CONTRACT_VERSION = "jobkorea-fixture-contract-v1";

const decodeEntities = (value: string): string => value
  .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

const stripTags = (value: string): string => decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const removeContactText = (value: string): string => value
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[연락처 제거]")
  .replace(/(?:01[016789]|0\d{1,2})[- )]?\d{3,4}[- ]?\d{4}/g, "[연락처 제거]");

function minimalJobPosting(value: unknown): JobKoreaJsonLd | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input["@type"] !== "JobPosting") return null;
  const output: JobKoreaJsonLd = { "@type": "JobPosting" };
  for (const key of ["title", "datePosted", "validThrough", "employmentType", "experienceRequirements", "educationRequirements", "url"] as const) {
    if (typeof input[key] === "string") output[key] = removeContactText(input[key] as string);
  }
  const identifier = input.identifier as Record<string, unknown> | undefined;
  if (identifier && (typeof identifier.value === "string" || typeof identifier.value === "number")) output.identifier = { value: identifier.value };
  const organization = input.hiringOrganization as Record<string, unknown> | undefined;
  if (organization && typeof organization.name === "string") output.hiringOrganization = { name: removeContactText(organization.name) };
  const salary = input.baseSalary as JobKoreaJsonLd["baseSalary"];
  if (salary && typeof salary === "object") {
    output.baseSalary = { currency: salary.currency };
    if (salary.value) output.baseSalary.value = { minValue: salary.value.minValue, maxValue: salary.value.maxValue,
      value: salary.value.value, unitText: salary.value.unitText };
  }
  const locations = input.jobLocation ? (Array.isArray(input.jobLocation) ? input.jobLocation : [input.jobLocation]) : [];
  output.jobLocation = locations.flatMap((location) => {
    if (!location || typeof location !== "object") return [];
    const address = (location as { address?: Record<string, unknown> }).address;
    if (!address) return [];
    return [{ address: {
      streetAddress: typeof address.streetAddress === "string" ? removeContactText(address.streetAddress) : undefined,
      addressLocality: typeof address.addressLocality === "string" ? address.addressLocality : undefined,
      addressRegion: typeof address.addressRegion === "string" ? address.addressRegion : undefined,
    } }];
  });
  return output;
}

function extractJsonLd(html: string): JobKoreaJsonLd[] {
  const results: JobKoreaJsonLd[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(match[1] ?? "null") as unknown;
      const candidates = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"])
        ? (parsed as { "@graph": unknown[] })["@graph"] : [parsed];
      for (const candidate of candidates) { const reduced = minimalJobPosting(candidate); if (reduced) results.push(reduced); }
    } catch { /* malformed JSON-LD is reported when no valid block remains */ }
  }
  return results;
}

function validateReduced(value: unknown): void {
  const serialized = JSON.stringify(value);
  const violations = inspectFixtureSafety(serialized);
  if (violations.length || /"(?:description|contactPoint|recruiter|applicant|cookie|session|token|script)"\s*:/i.test(serialized)) {
    throw new JobKoreaTransportError("JOBKOREA_SANITIZER_REJECTED", `sanitizer 안전성 검사 실패: ${violations.join(", ") || "forbidden field"}`);
  }
}

export interface SanitizedListingResult {
  fixture: JobKoreaListingFixture;
  observed: number;
  rejected: Array<{ candidate: string; code: string }>;
}

export function sanitizeJobKoreaListing(html: string, finalUrl: string, capturedAt: string): SanitizedListingResult {
  const items: JobKoreaListingFixtureItem[] = [];
  const rejected: SanitizedListingResult["rejected"] = [];
  const anchors = html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi);
  let observed = 0;
  for (const match of anchors) {
    const href = decodeEntities(match[2] ?? "");
    if (!/GI_Read\//i.test(href)) continue;
    observed += 1;
    try {
      const url = normalizeJobKoreaUrl(new URL(href, finalUrl).toString(), "detail");
      const sourcePostingId = sourcePostingIdFromUrl(url);
      if (!sourcePostingId) throw new JobKoreaTransportError("JOBKOREA_DETAIL_URL_REJECTED", "상세 ID가 없습니다.");
      items.push({ sourcePostingId, sourceUrl: url, title: removeContactText(stripTags(match[3] ?? "")) || `잡코리아 공고 ${sourcePostingId}`,
        companyName: "상세 페이지 확인 전", salaryText: null, regionText: null, categories: [], employmentTypes: [],
        experienceRequirement: null, educationRequirement: null, postedAt: null, deadlineText: null, promoted: null });
    } catch (error) {
      rejected.push({ candidate: href.slice(0, 200), code: error instanceof JobKoreaTransportError ? error.code : "JOBKOREA_DETAIL_URL_REJECTED" });
    }
  }
  const fixture: JobKoreaListingFixture = { metadata: { source: "jobkorea", capturedAt, sourcePageType: "listing", evidenceType: "observed_html",
    sanitized: true, notes: ["one-shot in-memory reduced listing; raw HTML not retained"] }, items };
  validateReduced(fixture);
  return { fixture, observed, rejected };
}

export function sanitizeJobKoreaDetail(html: string, finalUrl: string, capturedAt: string, explicitClosed: boolean): JobKoreaDetailFixture {
  const jsonLdBlocks = extractJsonLd(html);
  if (!jsonLdBlocks.length) throw new JobKoreaTransportError("JOBKOREA_DETAIL_PARSER_FAILURE", "안전하게 축약할 JobPosting JSON-LD가 없습니다.", finalUrl);
  const bodyText = stripTags(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<(?:style|iframe|form)\b[\s\S]*?<\/(?:style|iframe|form)>/gi, " "));
  const salaryText = bodyText.match(/(?:시급|일급|주급|월급|연봉)\s*[\d,.]+\s*만?\s*원?(?:\s*(?:~|-|～)\s*[\d,.]+\s*만?\s*원?)?(?:\s*\([^)]{0,80}\))?/u)?.[0]
    ?? bodyText.match(/회사\s*내규에?\s*따름(?:\s*\([^)]{0,80}\))?/u)?.[0] ?? null;
  const primary = jsonLdBlocks[0];
  const locations = primary?.jobLocation ? (Array.isArray(primary.jobLocation) ? primary.jobLocation : [primary.jobLocation]) : [];
  const address = locations[0]?.address;
  const fixture: JobKoreaDetailFixture = {
    metadata: { source: "jobkorea", capturedAt, sourcePageType: "detail", evidenceType: "observed_json_ld", sanitized: true,
      notes: ["one-shot in-memory minimal JobPosting evidence; noncanonical body fields excluded"] },
    sourceUrl: finalUrl,
    jsonLdBlocks,
    visible: { salaryText: salaryText ? removeContactText(salaryText) : null, workDaysText: null, workHoursText: null,
      nearestStation: null, addressText: typeof address?.streetAddress === "string" ? address.streetAddress : null,
      city: typeof address?.addressRegion === "string" ? address.addressRegion : null, district: null,
      neighborhood: typeof address?.addressLocality === "string" ? address.addressLocality : null, explicitClosed,
      workplaceCount: locations.length || null, headquartersAddressText: null, locationUndecided: false },
  };
  validateReduced(fixture);
  return fixture;
}
