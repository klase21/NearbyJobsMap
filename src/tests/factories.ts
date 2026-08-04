import type { CanonicalJob } from "../domain/canonical-job.js";
import { parseSalary } from "../services/salary-parser.js";

export function canonicalJob(overrides: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    id: "jobkorea:1", source: "jobkorea", sourcePostingId: "1", sourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1",
    canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1", title: "주방 보조", companyName: "주식회사 예시",
    normalizedCompanyName: "예시", descriptionSummary: null, categories: ["외식"], employmentTypes: ["정규직"],
    experienceRequirement: null, educationRequirement: null, salary: parseSalary("월급 280만원"), workDaysOriginalText: "주 5일",
    workStartTime: "09:00", workEndTime: "18:00", shiftType: "주간", addressOriginalText: "서울 강남구 테헤란로 1",
    roadAddress: "서울 강남구 테헤란로 1", parcelAddress: null, city: "서울", district: "강남구", neighborhood: "역삼동",
    nearestStation: null, latitude: null, longitude: null, locationAccuracy: "exact_address", workplaceCount: 1,
    postedAt: "2026-08-01", modifiedAt: null, expiresAt: "2026-08-31", postingStatus: "active", promoted: false,
    remote: false, collectedAt: "2026-08-05T00:00:00+09:00", lastVerifiedAt: "2026-08-05T00:00:00+09:00", rawPayloadReference: null,
    ...overrides,
  };
}
