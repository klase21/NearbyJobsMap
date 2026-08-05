// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterPanel } from "../../components/filters/FilterPanel";
import type { JobFilterState, UiJobRecord } from "../../domain/ui-job";
import { DEFAULT_FILTERS } from "../../services/job-search";
import { canonicalJob } from "../factories";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

const record = (city: string, district: string): UiJobRecord => ({
  job: canonicalJob({ city, district }), isFictional: true, safeSourceUrl: null, mapPosition: null,
});

describe("상세 필터 포커스 처리", () => {
  it("첫 필터에 초점을 두고 Escape로 닫는다", () => {
    const onClose = vi.fn();
    render(<FilterPanel filters={DEFAULT_FILTERS} jobs={[]} onChange={() => undefined} onClose={onClose} />);
    expect(screen.getByLabelText("서울·경기")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("마지막 버튼에서 Tab을 누르면 dialog의 첫 버튼으로 순환한다", () => {
    render(<FilterPanel filters={DEFAULT_FILTERS} jobs={[]} onChange={() => undefined} onClose={() => undefined} />);
    const lastButton = screen.getByRole("button", { name: "결과 보기" });
    lastButton.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
  });

  it("도시 변경 시 이전 구 선택을 함께 지운다", () => {
    const onChange = vi.fn();
    const filters: JobFilterState = { ...DEFAULT_FILTERS, city: "서울", district: "금천구" };
    render(<FilterPanel filters={filters} jobs={[record("서울", "금천구"), record("안양시", "동안구")]} onChange={onChange} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText("시·도시"), { target: { value: "안양시" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ city: "안양시", district: "" }));
  });

  it("급여 유형 변경 시 다른 단위의 임계값을 비활성화한다", () => {
    const onChange = vi.fn();
    const filters: JobFilterState = { ...DEFAULT_FILTERS, salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds, hourly: 13_000 } };
    render(<FilterPanel filters={filters} jobs={[]} onChange={onChange} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText("급여 유형"), { target: { value: "annual" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ salaryType: "annual", salaryThresholds: expect.objectContaining({ hourly: 0 }) }));
  });

  it("닫힌 뒤 필터 트리거로 초점을 돌려보낸다", () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>필터 열기</button>{open && <FilterPanel filters={DEFAULT_FILTERS} jobs={[]} onChange={() => undefined} onClose={() => setOpen(false)} />}</>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "필터 열기" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(trigger).toHaveFocus();
  });

  it("모바일 drawer가 열린 동안 배경 스크롤을 잠근다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const { unmount } = render(<FilterPanel filters={DEFAULT_FILTERS} jobs={[]} onChange={() => undefined} onClose={() => undefined} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
