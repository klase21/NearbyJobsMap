import type { CanonicalJob, CanonicalWorkplace } from "../domain/canonical-job";
import type { LocationAccuracy } from "../domain/location";
import type { PostingStatus } from "../domain/posting-status";
import type { SalaryType } from "../domain/salary";

const SOURCES = new Set(["jobkorea", "albamon", "work24"]);
const SALARY_TYPES = new Set<SalaryType>(["hourly", "daily", "weekly", "monthly", "annual", "per_task", "negotiable", "company_policy", "mixed", "unknown"]);
const LOCATION_ACCURACIES = new Set<LocationAccuracy>(["exact_coordinate", "exact_address", "neighborhood", "district", "city", "station_area", "multiple_locations", "headquarters_only", "location_undecided", "unavailable"]);
const POSTING_STATUSES = new Set<PostingStatus>(["active", "closing_soon", "expired", "closed", "removed", "unknown"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

export interface JobValidationIssue { code: string; message: string }

const nullableFinite = (value: number | null): boolean => value === null || Number.isFinite(value);

function validateWorkplace(workplace: CanonicalWorkplace, position: number): JobValidationIssue[] {
  const issues: JobValidationIssue[] = [];
  if (!workplace.originalText.trim()) issues.push({ code: "WORKPLACE_ORIGINAL_TEXT_MISSING", message: `${position + 1}번 근무지 원문이 비어 있습니다.` });
  if (!LOCATION_ACCURACIES.has(workplace.accuracy)) issues.push({ code: "INVALID_LOCATION_ACCURACY", message: `${position + 1}번 근무지 정확도 값이 유효하지 않습니다.` });
  if (!nullableFinite(workplace.latitude) || !nullableFinite(workplace.longitude)) issues.push({ code: "INVALID_WORKPLACE_COORDINATE", message: `${position + 1}번 근무지 좌표가 유효하지 않습니다.` });
  if ((workplace.latitude === null) !== (workplace.longitude === null)) issues.push({ code: "INCOMPLETE_WORKPLACE_COORDINATE", message: `${position + 1}번 근무지 좌표 쌍이 불완전합니다.` });
  return issues;
}

export function validateCanonicalJob(job: CanonicalJob): JobValidationIssue[] {
  const issues: JobValidationIssue[] = [];
  if (!job.id.trim()) issues.push({ code: "JOB_ID_MISSING", message: "canonical job ID가 비어 있습니다." });
  if (!SOURCES.has(job.source)) issues.push({ code: "INVALID_JOB_SOURCE", message: "지원하지 않는 source 값입니다." });
  if (!job.sourcePostingId.trim() && !job.canonicalUrl) issues.push({ code: "SOURCE_IDENTITY_MISSING", message: "source posting ID 또는 canonical URL이 필요합니다." });
  if (!job.title.trim()) issues.push({ code: "JOB_TITLE_MISSING", message: "공고 제목이 비어 있습니다." });
  if (!job.companyName.trim()) issues.push({ code: "COMPANY_NAME_MISSING", message: "회사명이 비어 있습니다." });
  if (!SALARY_TYPES.has(job.salary.type)) issues.push({ code: "INVALID_SALARY_TYPE", message: "급여 유형이 유효하지 않습니다." });
  if (!LOCATION_ACCURACIES.has(job.locationAccuracy)) issues.push({ code: "INVALID_LOCATION_ACCURACY", message: "위치 정확도 값이 유효하지 않습니다." });
  if (!POSTING_STATUSES.has(job.postingStatus)) issues.push({ code: "INVALID_POSTING_STATUS", message: "공고 상태 값이 유효하지 않습니다." });
  if (job.salary.currency !== null && job.salary.currency !== "KRW") issues.push({ code: "INVALID_SALARY_CURRENCY", message: "급여 통화 값이 유효하지 않습니다." });
  if (job.salary.normalizationConfidence !== null && !CONFIDENCE.has(job.salary.normalizationConfidence)) issues.push({ code: "INVALID_NORMALIZATION_CONFIDENCE", message: "급여 환산 신뢰도가 유효하지 않습니다." });
  const numbers = [job.salary.minimumAmount, job.salary.maximumAmount, job.salary.normalizedMonthlyMinimum, job.salary.normalizedMonthlyMaximum, job.latitude, job.longitude];
  if (numbers.some((value) => !nullableFinite(value))) issues.push({ code: "INVALID_NUMERIC_FIELD", message: "숫자 필드에 유효하지 않은 값이 있습니다." });
  if ((job.latitude === null) !== (job.longitude === null)) issues.push({ code: "INCOMPLETE_PRIMARY_COORDINATE", message: "호환 위치 좌표 쌍이 불완전합니다." });
  if (job.workplaceCount !== null && (!Number.isInteger(job.workplaceCount) || job.workplaceCount < 0)) issues.push({ code: "INVALID_WORKPLACE_COUNT", message: "근무지 개수는 0 이상의 정수여야 합니다." });
  job.workplaces.forEach((workplace, position) => issues.push(...validateWorkplace(workplace, position)));
  if (job.locationAccuracy === "location_undecided" && (job.latitude !== null || job.longitude !== null || job.roadAddress !== null || job.parcelAddress !== null)) {
    issues.push({ code: "LOCATION_UNDECIDED_HAS_EXACT_DATA", message: "근무지 미정 공고에 주소 또는 좌표를 저장할 수 없습니다." });
  }
  return issues;
}

export function isLocationAccuracy(value: unknown): value is LocationAccuracy {
  return typeof value === "string" && LOCATION_ACCURACIES.has(value as LocationAccuracy);
}

export function isSalaryType(value: unknown): value is SalaryType {
  return typeof value === "string" && SALARY_TYPES.has(value as SalaryType);
}

export function isPostingStatus(value: unknown): value is PostingStatus {
  return typeof value === "string" && POSTING_STATUSES.has(value as PostingStatus);
}
