import type { JobKoreaPageKind } from "./types";
import { JobKoreaTransportError } from "./jobkorea-error";

export const JOBKOREA_HARD_CONTENT_REQUEST_LIMIT = 4;
export const JOBKOREA_HARD_DETAIL_REQUEST_LIMIT = 3;
export const JOBKOREA_PREFLIGHT_REQUEST_LIMIT = 1;

export function getJobKoreaContentRequestLimit(maxDetails: number): number {
  return Math.min(JOBKOREA_HARD_CONTENT_REQUEST_LIMIT, 1 + maxDetails);
}

export class JobKoreaRequestBudget {
  preflightRequests = 0;
  contentRequests = 0;
  listingRequests = 0;
  detailRequests = 0;
  readonly contentRequestLimit: number;

  constructor(readonly detailRequestLimit = JOBKOREA_HARD_DETAIL_REQUEST_LIMIT, private readonly limits = { details: JOBKOREA_HARD_DETAIL_REQUEST_LIMIT, listings: 1, content: JOBKOREA_HARD_CONTENT_REQUEST_LIMIT }) {
    if (!Number.isInteger(detailRequestLimit) || detailRequestLimit < 1 || detailRequestLimit > limits.details) {
      throw new JobKoreaTransportError("JOBKOREA_REQUEST_BUDGET_INVALID", `상세 요청 한도는 1~${limits.details} 정수여야 합니다.`);
    }
    this.contentRequestLimit = limits.details === JOBKOREA_HARD_DETAIL_REQUEST_LIMIT ? getJobKoreaContentRequestLimit(detailRequestLimit) : Math.min(limits.content, detailRequestLimit);
  }

  startPage(kind: Exclude<JobKoreaPageKind, "robots">): void {
    if (kind === "listing") {
      if (this.listingRequests >= this.limits.listings) throw new JobKoreaTransportError("JOBKOREA_REQUEST_BUDGET_EXCEEDED", `목록 요청 시도 ${this.limits.listings}회를 초과했습니다.`);
      this.listingRequests += 1;
    } else {
      if (this.detailRequests >= this.detailRequestLimit) throw new JobKoreaTransportError("JOBKOREA_REQUEST_BUDGET_EXCEEDED", `상세 요청 시도 ${this.detailRequestLimit}회를 초과했습니다.`);
      this.detailRequests += 1;
    }
  }

  consumeHttp(kind: JobKoreaPageKind): void {
    if (kind === "robots") {
      if (this.preflightRequests >= JOBKOREA_PREFLIGHT_REQUEST_LIMIT) throw new JobKoreaTransportError("JOBKOREA_REQUEST_BUDGET_EXCEEDED", "robots 사전확인 시도 1회를 초과했습니다.");
      this.preflightRequests += 1;
      return;
    }
    if (this.contentRequests >= this.contentRequestLimit) throw new JobKoreaTransportError("JOBKOREA_REQUEST_BUDGET_EXCEEDED", `총 콘텐츠 HTTP 요청 한도 ${this.contentRequestLimit}회를 초과했습니다.`);
    this.contentRequests += 1;
  }

  static forManualDetailCollection(maxDetails: number): JobKoreaRequestBudget {
    return new JobKoreaRequestBudget(maxDetails, { details: 30, listings: 0, content: 30 });
  }
}
