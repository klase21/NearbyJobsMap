// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NearbyJobsDashboard } from "../../components/dashboard/NearbyJobsDashboard";
import type { UiJobRecord } from "../../domain/ui-job";
import { canonicalJob } from "../factories";

const noCoordinateRecord: UiJobRecord = {
  job: canonicalJob({ latitude: null, longitude: null, locationAccuracy: "exact_address" }),
  isFictional: true,
  safeSourceUrl: null,
  mapPosition: null,
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("max-width: 900px"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("모바일 목록·지도 전환", () => {
  it("목록에서는 숨은 지도를 만들지 않고 지도 선택 시에만 마운트한다", async () => {
    render(<NearbyJobsDashboard initialJobs={[noCoordinateRecord]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "목록" })).toHaveAttribute("aria-pressed", "true"));
    expect(document.querySelector("#dashboard-map")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^지도$/ }));
    await waitFor(() => expect(document.querySelector("#dashboard-map")).toBeInTheDocument());
    expect(screen.getByText("지도에 표시할 좌표가 없습니다")).toBeInTheDocument();
  });

  it("모바일 지도에서 지도 접기를 누르면 빈 화면 대신 목록으로 돌아간다", async () => {
    render(<NearbyJobsDashboard initialJobs={[noCoordinateRecord]} />);
    fireEvent.click(screen.getByRole("button", { name: /^지도$/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "지도" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "지도 접기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "목록" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByLabelText("통합 공고 목록 패널")).toBeVisible();
  });
});
