import type { Request } from "playwright";
import { JobKoreaSnapshotError } from "./jobkorea-page-snapshot";
import type { JobKoreaFailedResourceSample, JobKoreaFailedResourceSummary, JobKoreaResourceType } from "./jobkorea-search-types";

export const JOBKOREA_FAILED_RESOURCE_SAMPLE_LIMIT = 5;
const RESOURCE_TYPES = new Set<JobKoreaResourceType>(["document", "script", "xhr", "fetch", "stylesheet", "image", "font", "media", "other"]);
const HOST_CATEGORIES = new Set<JobKoreaFailedResourceSample["hostCategory"]>(["jobkorea", "third_party", "invalid"]);

export interface JobKoreaFailedResourceInput {
  resourceType: string;
  url: string;
  failureCode: string;
}

function normalizeResourceType(value: string): JobKoreaResourceType {
  return RESOURCE_TYPES.has(value as JobKoreaResourceType) ? value as JobKoreaResourceType : "other";
}

function hostCategory(rawUrl: string): JobKoreaFailedResourceSample["hostCategory"] {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "jobkorea.co.kr" || host.endsWith(".jobkorea.co.kr") ? "jobkorea" : "third_party";
  } catch { return "invalid"; }
}

function invalidSummary(message: string): never {
  throw new JobKoreaSnapshotError("JOBKOREA_FAILED_RESOURCE_SUMMARY_INVALID", message);
}

export function validateJobKoreaFailedResourceSummary(value: unknown): JobKoreaFailedResourceSummary {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalidSummary("failed-resource summary가 plain object가 아닙니다.");
  const record = value as Record<string, unknown>;
  if (!Number.isInteger(record.totalCount) || (record.totalCount as number) < 0) invalidSummary("failed-resource total count가 유효하지 않습니다.");
  if (record.typeCounts === null || typeof record.typeCounts !== "object" || Array.isArray(record.typeCounts)) invalidSummary("failed-resource type counts가 유효하지 않습니다.");
  const typeCounts: JobKoreaFailedResourceSummary["typeCounts"] = {};
  let typeTotal = 0;
  const entries = Object.entries(record.typeCounts as Record<string, unknown>);
  if (entries.map(([key]) => key).join("\0") !== entries.map(([key]) => key).sort().join("\0")) invalidSummary("failed-resource type keys가 결정적 순서가 아닙니다.");
  for (const [key, count] of entries) {
    if (!RESOURCE_TYPES.has(key as JobKoreaResourceType) || !Number.isInteger(count) || (count as number) <= 0) invalidSummary("failed-resource type count가 유효하지 않습니다.");
    typeCounts[key as JobKoreaResourceType] = count as number;
    typeTotal += count as number;
  }
  if (typeTotal !== record.totalCount) invalidSummary("failed-resource type count 합계가 total count와 다릅니다.");
  if (!Array.isArray(record.samples) || record.samples.length > JOBKOREA_FAILED_RESOURCE_SAMPLE_LIMIT) invalidSummary("failed-resource sample 수가 제한을 초과했습니다.");
  const samples = record.samples.map((sample): JobKoreaFailedResourceSample => {
    if (sample === null || typeof sample !== "object" || Array.isArray(sample)) invalidSummary("failed-resource sample이 plain object가 아닙니다.");
    const item = sample as Record<string, unknown>;
    if (!RESOURCE_TYPES.has(item.resourceType as JobKoreaResourceType) || !HOST_CATEGORIES.has(item.hostCategory as JobKoreaFailedResourceSample["hostCategory"])) invalidSummary("failed-resource sample 분류가 유효하지 않습니다.");
    if (typeof item.failureCode !== "string" || item.failureCode.length === 0 || item.failureCode.length > 100 || typeof item.navigationCritical !== "boolean") invalidSummary("failed-resource sample 필드가 유효하지 않습니다.");
    return { resourceType: item.resourceType as JobKoreaResourceType, hostCategory: item.hostCategory as JobKoreaFailedResourceSample["hostCategory"], failureCode: item.failureCode, navigationCritical: item.navigationCritical };
  });
  if (typeof record.samplesTruncated !== "boolean" || typeof record.preventedReadinessOrExtraction !== "boolean" && record.preventedReadinessOrExtraction !== null) invalidSummary("failed-resource summary 상태가 유효하지 않습니다.");
  if (record.samplesTruncated !== ((record.totalCount as number) > JOBKOREA_FAILED_RESOURCE_SAMPLE_LIMIT)) invalidSummary("failed-resource sample truncation 상태가 count와 다릅니다.");
  return { totalCount: record.totalCount as number, typeCounts, samples, samplesTruncated: record.samplesTruncated,
    preventedReadinessOrExtraction: record.preventedReadinessOrExtraction as boolean | null };
}

export function summarizeJobKoreaFailedResources(
  inputs: readonly JobKoreaFailedResourceInput[],
  preventedReadinessOrExtraction: boolean | null,
): JobKoreaFailedResourceSummary {
  const typeCounts: JobKoreaFailedResourceSummary["typeCounts"] = {};
  const samples: JobKoreaFailedResourceSample[] = [];
  for (const input of inputs) {
    const resourceType = normalizeResourceType(input.resourceType);
    typeCounts[resourceType] = (typeCounts[resourceType] ?? 0) + 1;
    if (samples.length < JOBKOREA_FAILED_RESOURCE_SAMPLE_LIMIT) samples.push({
      resourceType,
      hostCategory: hostCategory(input.url),
      failureCode: input.failureCode.replace(/\s+/g, " ").trim().slice(0, 100) || "unknown",
      navigationCritical: resourceType === "document",
    });
  }
  return validateJobKoreaFailedResourceSummary({
    totalCount: inputs.length,
    typeCounts: Object.fromEntries(Object.entries(typeCounts).sort(([left], [right]) => left.localeCompare(right))),
    samples,
    samplesTruncated: inputs.length > JOBKOREA_FAILED_RESOURCE_SAMPLE_LIMIT,
    preventedReadinessOrExtraction,
  });
}

export function failedResourceInputFromRequest(request: Request): JobKoreaFailedResourceInput {
  return {
    resourceType: request.resourceType(),
    url: request.url(),
    failureCode: request.failure()?.errorText ?? "unknown",
  };
}

export const emptyJobKoreaFailedResourceSummary = (): JobKoreaFailedResourceSummary => ({
  totalCount: 0, typeCounts: {}, samples: [], samplesTruncated: false, preventedReadinessOrExtraction: null,
});
