import type { CanonicalJob } from "../domain/canonical-job";
import type { LocationAccuracy } from "../domain/location";
import type { PostingStatus } from "../domain/posting-status";
import type { ActiveJobSource, MapPosition, UiJobRecord } from "../domain/ui-job";
import { normalizeSalary } from "../services/salary-normalizer";
import { parseSalary } from "../services/salary-parser";

interface DemoInput {
  id: string; source: ActiveJobSource; title: string; company: string; category: string; employment: string;
  salary: string; address: string; city: string; district?: string; neighborhood?: string; station?: string;
  locationAccuracy: LocationAccuracy; mapPosition?: Omit<MapPosition, "provenance">; postedAt: string; expiresAt?: string;
  postingStatus: PostingStatus; workDays?: string; workStart?: string; workEnd?: string; experience?: string; education?: string;
}

function createDemoRecord(input: DemoInput): UiJobRecord {
  const job: CanonicalJob = {
    id: `demo:${input.id}`, source: input.source, sourcePostingId: `demo-${input.id}`, sourceUrl: "", canonicalUrl: null,
    title: input.title, companyName: input.company, normalizedCompanyName: input.company.replace(/\s/g, ""),
    descriptionSummary: "기능과 화면 검증을 위해 만든 가상 공고입니다.", categories: [input.category], employmentTypes: [input.employment],
    experienceRequirement: input.experience ?? "경력무관", educationRequirement: input.education ?? "학력무관",
    salary: normalizeSalary(parseSalary(input.salary)), workDaysOriginalText: input.workDays ?? "주 5일",
    workStartTime: input.workStart ?? "09:00", workEndTime: input.workEnd ?? "18:00", shiftType: null,
    addressOriginalText: input.address, roadAddress: input.locationAccuracy === "exact_address" || input.locationAccuracy === "exact_coordinate" ? input.address : null,
    parcelAddress: null, city: input.city, district: input.district ?? null, neighborhood: input.neighborhood ?? null,
    nearestStation: input.station ?? null,
    latitude: input.locationAccuracy === "exact_coordinate" && input.mapPosition ? input.mapPosition.latitude : null,
    longitude: input.locationAccuracy === "exact_coordinate" && input.mapPosition ? input.mapPosition.longitude : null,
    locationAccuracy: input.locationAccuracy,
    workplaces: input.locationAccuracy === "location_undecided" || input.locationAccuracy === "unavailable" || input.locationAccuracy === "multiple_locations" ? [] : [{ originalText: input.address, roadAddress: input.locationAccuracy === "exact_address" || input.locationAccuracy === "exact_coordinate" ? input.address : null, parcelAddress: null, city: input.city, district: input.district ?? null, neighborhood: input.neighborhood ?? null, nearestStation: input.station ?? null, latitude: input.locationAccuracy === "exact_coordinate" && input.mapPosition ? input.mapPosition.latitude : null, longitude: input.locationAccuracy === "exact_coordinate" && input.mapPosition ? input.mapPosition.longitude : null, accuracy: input.locationAccuracy, isHeadquartersOnly: false }],
    workplaceCount: input.locationAccuracy === "multiple_locations" ? 2 : input.locationAccuracy === "location_undecided" ? null : 1,
    postedAt: input.postedAt, modifiedAt: null, expiresAt: input.expiresAt ?? null, postingStatus: input.postingStatus,
    promoted: false, remote: false, collectedAt: "2026-08-05T09:00:00+09:00", lastVerifiedAt: "2026-08-05T09:00:00+09:00", rawPayloadReference: null,
  };
  return {
    job, isFictional: true, safeSourceUrl: null,
    mapPosition: input.mapPosition ? { ...input.mapPosition, provenance: "fictional_demo" } : null,
  };
}

export const DEMO_JOBS: UiJobRecord[] = [
  createDemoRecord({ id: "jk-001", source: "jobkorea", title: "물류센터 피킹·포장", company: "새봄물류", category: "물류·포장", employment: "정규직", salary: "월급 285만원", address: "경기 군포시 산본로 21", city: "군포시", district: "산본동", locationAccuracy: "exact_coordinate", mapPosition: { latitude: 37.3617, longitude: 126.9352, kind: "exact" }, postedAt: "2026-08-05", expiresAt: "2026-08-28", postingStatus: "active" }),
  createDemoRecord({ id: "am-002", source: "albamon", title: "약국 물류 보조", company: "한결유통", category: "물류·포장", employment: "파트타임", salary: "시급 13,500원", address: "경기 안양시 동안구 범계역 인근", city: "안양시", district: "동안구", station: "범계역", locationAccuracy: "station_area", mapPosition: { latitude: 37.3899, longitude: 126.9514, kind: "estimated" }, postedAt: "2026-08-05", expiresAt: "2026-08-07", postingStatus: "closing_soon", workDays: "월~금", workStart: "10:00", workEnd: "19:00" }),
  createDemoRecord({ id: "jk-003", source: "jobkorea", title: "식품 포장·검수 담당", company: "다온포장", category: "생산·제조", employment: "계약직", salary: "일급 150,000원", address: "경기 화성시 동탄대로 88", city: "화성시", district: "동탄", locationAccuracy: "exact_address", postedAt: "2026-08-04", expiresAt: "2026-08-20", postingStatus: "active", workDays: "주 4일", workStart: "08:00", workEnd: "17:00" }),
  createDemoRecord({ id: "am-004", source: "albamon", title: "매장 운영 스태프", company: "푸른마켓", category: "매장관리", employment: "정규직", salary: "연봉 4,200만원", address: "서울 금천구 가산디지털로 12", city: "서울", district: "금천구", neighborhood: "가산동", locationAccuracy: "exact_coordinate", mapPosition: { latitude: 37.4784, longitude: 126.8849, kind: "exact" }, postedAt: "2026-08-03", expiresAt: "2026-08-31", postingStatus: "active", experience: "경력 1년 이상" }),
  createDemoRecord({ id: "jk-005", source: "jobkorea", title: "새벽 배송 분류", company: "온누리배송", category: "배송·운송", employment: "아르바이트", salary: "시급 15,000원", address: "서울 송파구 문정동", city: "서울", district: "송파구", neighborhood: "문정동", locationAccuracy: "neighborhood", mapPosition: { latitude: 37.4822, longitude: 127.1227, kind: "estimated" }, postedAt: "2026-08-02", postingStatus: "unknown", workDays: "주 3일", workStart: "02:00", workEnd: "07:00" }),
  createDemoRecord({ id: "am-006", source: "albamon", title: "창고 입출고 담당", company: "바른창고", category: "물류·포장", employment: "정규직", salary: "월급 310만원", address: "경기 성남시 분당구", city: "성남시", district: "분당구", locationAccuracy: "district", mapPosition: { latitude: 37.3828, longitude: 127.119, kind: "estimated" }, postedAt: "2026-08-01", expiresAt: "2026-08-08", postingStatus: "closing_soon" }),
  createDemoRecord({ id: "jk-007", source: "jobkorea", title: "신선식품 검품", company: "햇살마켓", category: "품질관리", employment: "계약직", salary: "일급 165,000원", address: "경기 수원시 권선구 산업로 55", city: "수원시", district: "권선구", locationAccuracy: "exact_coordinate", mapPosition: { latitude: 37.2633, longitude: 126.9992, kind: "exact" }, postedAt: "2026-08-05", expiresAt: "2026-08-25", postingStatus: "active", workStart: "07:00", workEnd: "16:00" }),
  createDemoRecord({ id: "am-008", source: "albamon", title: "고객지원 사무보조", company: "이음서비스", category: "고객상담", employment: "계약직", salary: "연봉 3,800만원", address: "서울 구로구 구로디지털단지역 도보권", city: "서울", district: "구로구", station: "구로디지털단지역", locationAccuracy: "station_area", mapPosition: { latitude: 37.4852, longitude: 126.9015, kind: "estimated" }, postedAt: "2026-08-04", expiresAt: "2026-08-18", postingStatus: "active", education: "고졸 이상" }),
  createDemoRecord({ id: "jk-009", source: "jobkorea", title: "행사 운영 지원", company: "두레파트너스", category: "행사·서비스", employment: "단기계약", salary: "월급 270만원", address: "서울 내 근무지 면접 후 결정", city: "서울", locationAccuracy: "location_undecided", postedAt: "2026-08-01", postingStatus: "unknown", workDays: "일정 협의" }),
  createDemoRecord({ id: "am-010", source: "albamon", title: "매장 진열·재고 관리", company: "모아유통", category: "매장관리", employment: "정규직", salary: "회사 내규에 따름", address: "경기 의왕시 오전로 31", city: "의왕시", district: "오전동", locationAccuracy: "exact_address", postedAt: "2026-07-31", expiresAt: "2026-08-30", postingStatus: "active" }),
];
