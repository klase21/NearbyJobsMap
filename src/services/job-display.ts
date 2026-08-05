import type { LocationAccuracy } from "../domain/location";
import type { PostingStatus } from "../domain/posting-status";
import type { SalaryType } from "../domain/salary";
import type { SortOption, UserJobStatus } from "../domain/ui-job";

export const SOURCE_LABELS = { jobkorea: "잡코리아", albamon: "알바몬" } as const;
export const LOCATION_LABELS: Record<LocationAccuracy, string> = {
  exact_coordinate: "정확한 좌표", exact_address: "정확한 주소", neighborhood: "동 단위 위치", district: "구 단위 위치",
  city: "시 단위 위치", station_area: "역세권 추정", multiple_locations: "복수 근무지", headquarters_only: "본사 주소만 확인",
  location_undecided: "근무지 미정", unavailable: "위치정보 없음",
};
export const POSTING_STATUS_LABELS: Record<PostingStatus, string> = {
  active: "모집 중", closing_soon: "마감 임박", expired: "기간 만료", closed: "마감", removed: "삭제됨", unknown: "상태 미확인",
};
export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  hourly: "시급", daily: "일급", weekly: "주급", monthly: "월급", annual: "연봉", per_task: "건별",
  negotiable: "협의", company_policy: "회사 내규", mixed: "혼합 보상", unknown: "미확인",
};
export const SORT_LABELS: Record<SortOption, string> = {
  newest: "최신 등록순", deadline: "마감 임박순", distance: "가까운 순", hourly: "시급 높은 순", daily: "일급 높은 순",
  monthly: "월급 높은 순", annual: "연봉 높은 순", normalized_monthly: "월 환산 예상금액 높은 순", company: "회사명순",
};
export const USER_STATUS_LABELS: Record<UserJobStatus, string> = {
  reviewing: "검토 중", saved: "관심", planned: "지원 예정", applied: "지원 완료", excluded: "제외",
};
export const SALARY_CONFIDENCE_LABELS = {
  high: "높음",
  medium: "보통",
  low: "낮음",
} as const;

export function formatWon(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
}

export function formatDate(value: string | null): string {
  if (!value) return "미확인";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "미확인" : new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date);
}
