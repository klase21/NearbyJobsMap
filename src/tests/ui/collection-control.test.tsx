// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionControl } from "../../components/collection/CollectionControl";
import { JOBKOREA_COLLECTION_PRESETS } from "../../sources/jobkorea/collection/jobkorea-collection-presets";
import { COLLECTION_PRESETS } from "../../sources/collection/collection-presets";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const presets = Object.values(JOBKOREA_COLLECTION_PRESETS);

describe("CollectionControl", () => {
  it("shows source-aware Albamon preset cards with listing-only operation", () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("recent") ? { runs: [] } : { run: null }), { status: 200 })));
    render(<CollectionControl enabled presets={Object.values(COLLECTION_PRESETS)} />);
    const albamon = screen.getByRole("radio", { name: /^알바몬 서울·경기 오늘 등록/ });
    expect(albamon).toHaveTextContent("알바몬"); expect(albamon).toHaveTextContent("오늘 등록 · 목록 정보");
    fireEvent.click(albamon); expect(screen.getByText("상세 요청 없음")).toBeInTheDocument();
  });
  it("explains the disabled local-only state", () => {
    render(<CollectionControl enabled={false} presets={presets} />);
    expect(screen.getByRole("status")).toHaveTextContent("NEARBY_JOBS_ENABLE_COLLECTION_UI=1");
  });

  it("renders preset cards and resolves reduced limits", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("recent") ? { runs: [] } : { run: null }), { status: 200 })));
    render(<CollectionControl enabled presets={presets} />);
    expect(screen.getByRole("radio", { name: /서울 AI 일자리/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /^경기 AI 일자리/ }));
    const pages = screen.getByLabelText("목록 페이지"); fireEvent.change(pages, { target: { value: "1" } });
    const details = screen.getByLabelText("최대 후보 수"); fireEvent.change(details, { target: { value: "5" } });
    expect(pages).toHaveValue(1); expect(details).toHaveValue(5);
    fireEvent.click(screen.getByRole("button", { name: "드라이런 실행" }));
    expect(screen.getByRole("group", { name: "드라이런 확인" })).toHaveTextContent("데이터베이스 쓰기: 없음");
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/collection-runs/recent", { cache: "no-store" }));
  });

  it("rejects invalid controls client-side and exposes accessible progress", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("recent") ? { runs: [] } : { run: null }), { status: 200 })));
    render(<CollectionControl enabled presets={presets} />);
    fireEvent.change(screen.getByLabelText("목록 페이지"), { target: { value: "9" } });
    expect(screen.getByRole("button", { name: "드라이런 실행" })).toBeDisabled();
  });

  it("reconnects to a completed dry-run, validates the write phrase, and invalidates changed configuration", async () => {
    const completed = { status: "completed", message: "수집 완료", listingPagesRequested: 1, maxDetailsRequested: 5, listingPagesCompleted: 1,
      numericLinksExtracted: 12, uniquePostingIds: 5, regionMatchingCandidates: 5, selectedCandidates: 5, detailAttemptsCompleted: 5,
      detailAttemptsTotal: 5, successfulDetailParses: 0, listingFallbacks: 5, failedRecords: 0, predictedInserts: 2, predictedUpdates: 1,
      predictedUnchanged: 2, actualInserts: 0, actualUpdates: 0, actualUnchanged: 0, lowerCompletenessSkips: 0, runId: "dry-1", mode: "dry_run",
      presetId: "seoul-ai", presetLabel: "서울 AI 일자리", startedAt: "2026-08-06T00:00:00Z", updatedAt: "2026-08-06T00:00:01Z",
      elapsedMs: 1000, error: null, writeAuthorizationToken: "opaque", writeAuthorizationExpiresAt: "2026-08-06T00:30:00Z",
      result: { mode: "dry-run", listingPagesCompleted: 1, numericLinksExtracted: 12, uniquePostingIds: 5, seoulMatches: 5, gyeonggiMatches: 0,
        unknownRegionCandidates: 0, candidatesSelected: 5, successfullyParsed: 0, blockedDetails: 5, listingOnlyRecords: 5, predictedInserts: 2,
        predictedUpdates: 1, predictedUnchanged: 2, predictedLowerCompletenessSkips: 0 } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("recent") ? { runs: [{ id: "db-1", presetLabel: "서울 AI 일자리", startedAt: "2026-08-06T00:00:00Z", attempted: 5, inserted: 2, updated: 1, unchanged: 2, failed: 0, status: "completed" }] } : { run: completed }), { status: 200 })));
    render(<CollectionControl enabled presets={presets} />);
    const phrase = await screen.findByRole("textbox", { name: /확인 문구/ }); const write = screen.getByRole("button", { name: "실제 수집 실행" });
    expect(write).toBeDisabled(); fireEvent.change(phrase, { target: { value: "WRITE seoul-ai" } }); expect(write).toBeEnabled();
    expect(screen.getByText("최근 실제 수집").parentElement).toHaveTextContent("시도 5");
    fireEvent.change(screen.getByLabelText("최대 후보 수"), { target: { value: "4" } });
    expect(screen.queryByRole("textbox", { name: /확인 문구/ })).not.toBeInTheDocument();
  });
});
