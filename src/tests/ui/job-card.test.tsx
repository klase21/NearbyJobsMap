// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UiJobRecord } from "../../domain/ui-job";
import { DEFAULT_ORIGIN } from "../../repositories/preferences-repository";
import { canonicalJob } from "../factories";
import { JobCard } from "../../components/jobs/JobCard";

const demo: UiJobRecord = { job: canonicalJob({ id: "demo:1", sourcePostingId: "demo-1", sourceUrl: "", canonicalUrl: null }), isFictional: true, safeSourceUrl: null, mapPosition: null };

afterEach(cleanup);

describe("공고 카드", () => {
  it("keeps semantic duplicates collapsed and exposes each secondary identity and workspace state", () => {
    const secondary:UiJobRecord={...demo,isFictional:false,safeSourceUrl:"https://www.jobkorea.co.kr/Recruit/GI_Read/2",job:{...demo.job,id:"jobkorea:2",sourcePostingId:"2",sourceUrl:"https://www.jobkorea.co.kr/Recruit/GI_Read/2",canonicalUrl:"https://www.jobkorea.co.kr/Recruit/GI_Read/2"}};
    const onSecondaryState=vi.fn();
    render(<JobCard record={{...demo,job:{...demo.job,id:"jobkorea:1"}}} rank={1} selected={false} origin={DEFAULT_ORIGIN} onSelect={()=>undefined} onMapFocus={()=>undefined} onDuplicateUserStateChange={onSecondaryState} cardRef={()=>undefined}
      duplicateGroup={{representativeId:"jobkorea:1",totalItems:2,hasUserState:true}} loadDuplicateGroup={async()=>({representativeId:"jobkorea:1",members:[secondary],userStates:[{jobId:"jobkorea:2",isFavorite:true,workflowStatus:"interested",isHidden:false,isArchived:false,note:"review",applicationDate:null,followUpAt:null,personalDeadline:null,createdAt:"2026-08-07",updatedAt:"2026-08-07"}],freshness:[]})} />);
    expect(screen.queryByRole("region",{name:"같은 공고 2건"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/같은 공고 2건/}));
    return screen.findByRole("link",{name:/원문 새 창에서 보기/}).then(link=>{expect(screen.getByRole("region",{name:"같은 공고 2건"})).toBeInTheDocument();expect(link).toHaveAttribute("href","https://www.jobkorea.co.kr/Recruit/GI_Read/2");fireEvent.click(screen.getByRole("button",{name:"★ 관심 해제"}));expect(onSecondaryState).toHaveBeenCalledWith("jobkorea:2",expect.objectContaining({isFavorite:false}));});
  });
  it("선택된 첫 카드도 개인 지원 관리를 명시적으로 열기 전에는 접어 둔다", () => {
    render(<JobCard record={demo} rank={1} selected={true} origin={DEFAULT_ORIGIN} onSelect={() => undefined}
      onMapFocus={() => undefined} onUserStateChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.queryByRole("region", { name: "개인 지원 관리" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "개인 지원 관리" }));
    expect(screen.getByRole("region", { name: "개인 지원 관리" })).toBeInTheDocument();
  });
  it("가상 공고를 실제 원문 링크로 표시하지 않는다", () => {
    render(<JobCard record={demo} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined}
      onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText("기능 검증용 가상 공고")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /원문/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /지도 표시 불가/ })).toBeDisabled();
  });
  it("사용자 상태 변경은 별도 callback으로 전달", () => {
    const onChange = vi.fn();
    render(<JobCard record={demo} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined}
      onMapFocus={() => undefined} onUserStatusChange={onChange} cardRef={() => undefined} />);
    fireEvent.change(screen.getByLabelText("사용자 상태"), { target: { value: "saved" } });
    expect(onChange).toHaveBeenCalledWith("saved");
  });
  it("월 환산 신뢰도와 행정구역을 한국어로 표시", () => {
    const record: UiJobRecord = { ...demo, job: { ...demo.job, city: "서울", district: "강남구", salary: { ...demo.job.salary, normalizedMonthlyMinimum: 2_800_000, normalizationConfidence: "high" } } };
    render(<JobCard record={record} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined}
      onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText(/월 환산 예상 2,800,000원 · 신뢰도 높음/)).toBeInTheDocument();
    expect(screen.getByText(/서울 · 강남구/)).toBeInTheDocument();
  });
  it("근무지 미정은 목록에 남기고 지도 표시 불가 사유를 제공", () => {
    const undecided: UiJobRecord = { ...demo, job: { ...demo.job, addressOriginalText: "근무지 면접 후 결정", roadAddress: null, city: null, district: null, neighborhood: null, latitude: null, longitude: null, workplaces: [], workplaceCount: null, locationAccuracy: "location_undecided" } };
    render(<JobCard record={undecided} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText("근무지 미정")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /지도 표시 불가/ })).toBeDisabled();
  });
  it("복수 근무지는 신뢰 가능한 개수와 위치 미리보기를 표시한다", () => {
    const multiple: UiJobRecord = { ...demo, job: { ...demo.job, addressOriginalText: "서울 영등포구 · 경기 안양시", roadAddress: null, city: null, district: null, neighborhood: null, latitude: null, longitude: null, locationAccuracy: "multiple_locations", workplaceCount: 2, workplaces: [
      { originalText: "서울 영등포구", roadAddress: null, parcelAddress: null, city: "서울", district: "영등포구", neighborhood: null, nearestStation: null, latitude: null, longitude: null, accuracy: "district", isHeadquartersOnly: false },
      { originalText: "경기 안양시", roadAddress: null, parcelAddress: null, city: "경기", district: "안양시", neighborhood: null, nearestStation: null, latitude: null, longitude: null, accuracy: "district", isHeadquartersOnly: false },
    ] } };
    render(<JobCard record={multiple} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getAllByText("복수 근무지").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2곳 · 서울 영등포구 · 경기 안양시/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /개별 근무지 좌표가 확인되지 않아/ })).toBeDisabled();
  });

  it("공고 제목은 검색 결과 아래의 3단계 표제다", () => {
    render(<JobCard record={demo} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByRole("heading", { level: 3, name: demo.job.title })).toBeInTheDocument();
  });

  it("원샷 관찰 provenance와 확인 시각·공식 연동 아님 경고를 표시한다", () => {
    const observed: UiJobRecord = { ...demo, isFictional: false, safeSourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1",
      provenanceKind: "live_one_shot_observation", observedAt: "2026-08-05T00:00:00Z" };
    render(<JobCard record={observed} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText("원샷 전송 검증 데이터")).toBeInTheDocument();
    expect(screen.getByText(/제한적 공개 페이지 관찰/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /원문 새 창에서 보기/ });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("수동 수집 provenance를 fixture와 demo와 구분하고 안전한 원문 링크를 유지한다", () => {
    const collected: UiJobRecord = { ...demo, isFictional: false, safeSourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50000001",
      provenanceKind: "live_one_shot_observation", observationKind: "bounded_manual_collection", observedAt: "2026-08-05T00:00:00Z" };
    render(<JobCard record={collected} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText("수동 수집")).toBeInTheDocument();
    expect(screen.getByText(/원문을 최종 기준으로 확인하세요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /원문 새 창에서 보기/ })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("목록 정보와 상세 확인 수집 완성도를 명확히 구분한다", () => {
    const listingOnly: UiJobRecord = { ...demo, isFictional: false, safeSourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/50000002",
      provenanceKind: "live_one_shot_observation", observationKind: "bounded_listing_collection", observedAt: "2026-08-05T00:00:00Z" };
    const { rerender } = render(<JobCard record={listingOnly} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText("목록 정보")).toBeInTheDocument();
    expect(screen.getByText(/상세 내용은 확인되지 않았습니다/)).toBeInTheDocument();
    rerender(<JobCard record={{ ...listingOnly, observationKind: "bounded_manual_collection" }} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText("상세 확인")).toBeInTheDocument();
    expect(screen.queryByText(/상세 내용은 확인되지 않았습니다/)).not.toBeInTheDocument();
  });

  it("알바몬 source-filter 지역 근거를 표시하고 가짜 위치 행을 만들지 않는다", () => {
    const record: UiJobRecord = { ...demo, isFictional: false, safeSourceUrl: "https://www.albamon.com/jobs/detail/50000003",
      provenanceKind: "live_one_shot_observation", observationKind: "bounded_listing_collection", observedAt: "2026-08-06T00:00:00Z",
      normalizedRegions: ["seoul"], regionConfidence: "exact_source_filter", regionEvidenceSource: "source_filter", sourceAreaCode: "I000",
      job: { ...demo.job, id: "albamon:50000003", source: "albamon", sourcePostingId: "50000003",
        sourceUrl: "https://www.albamon.com/jobs/detail/50000003", canonicalUrl: "https://www.albamon.com/jobs/detail/50000003",
        addressOriginalText: null, city: null, district: null, locationAccuracy: "unavailable" } };
    render(<JobCard record={record} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText(/알바몬 목록 페이지/)).toBeInTheDocument();
    expect(screen.getByText("서울 · 지역은 알바몬 검색 조건 범위만 확인되었으며 개별 주소를 뜻하지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByText("위치", { selector: "strong" })).not.toBeInTheDocument();
  });

  it("알바몬 결합 검색은 정확한 서울·경기 대신 수도권 검색범위로 표시한다", () => {
    const record: UiJobRecord = { ...demo, isFictional: false, normalizedRegions: ["capital_scope"], regionConfidence: "exact_source_filter",
      regionEvidenceSource: "source_filter", sourceAreaCode: "I000,B000", observationKind: "bounded_listing_collection",
      job: { ...demo.job, source: "albamon", addressOriginalText: null, city: null, district: null, locationAccuracy: "unavailable" } };
    render(<JobCard record={record} rank={1} selected={false} origin={DEFAULT_ORIGIN} userStatus="reviewing" onSelect={() => undefined} onMapFocus={() => undefined} onUserStatusChange={() => undefined} cardRef={() => undefined} />);
    expect(screen.getByText(/서울·경기 검색범위 · 지역은/)).toBeInTheDocument();
    expect(screen.queryByText(/^서울 ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^경기 ·/)).not.toBeInTheDocument();
  });
});
