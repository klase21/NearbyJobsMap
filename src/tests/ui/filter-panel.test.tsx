// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterPanel } from "../../components/filters/FilterPanel";
import { DEFAULT_FILTERS } from "../../services/job-search";

afterEach(cleanup);

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
});
