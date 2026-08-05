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
});
