// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionDashboard } from "../../components/collection/CollectionDashboard";
import type { CollectionDashboardData } from "../../server/collection-dashboard/contracts";
import { COLLECTION_PRESETS } from "../../sources/collection/collection-presets";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const dashboard: CollectionDashboardData = {
  generatedAt: "2026-08-06T00:00:00Z", filters: { period: "30d", source: "all", status: "all" },
  inventory: { totalJobs: 46, jobkoreaJobs: 38, albamonJobs: 8, fixtureRecords: 6, fictionalRecords: 10, manuallyCollectedRecords: 30,
    listingOnlyRecords: 30, detailCompleteRecords: 0, completenessUnknownRecords: 16, mapEligibleRecords: 8, listOnlyRecords: 38 },
  sources: [
    { source: "jobkorea", storedJobs: 38, manuallyCollected: 30, fixture: 3, listingOnly: 30, detailComplete: 0, completenessUnknown: 8, mapEligible: 4, latestObservedAt: "2026-08-06T00:00:00Z", latestRun: { status: "completed", startedAt: "2026-08-06T00:00:00Z", presetLabel: "서울 AI 일자리" } },
    { source: "albamon", storedJobs: 8, manuallyCollected: 0, fixture: 3, listingOnly: 0, detailComplete: 0, completenessUnknown: 8, mapEligible: 4, latestObservedAt: null, latestRun: null },
  ],
  regions: { seoul: { total: 12, manual: 10 }, gyeonggi: { total: 10, manual: 8 }, multiple: { total: 2, manual: 2 }, other: { total: 1, manual: 0 }, unknown: { total: 21, manual: 10 } },
  completenessBySource: [{ source: "jobkorea", listingOnly: 30, detailComplete: 0, unknown: 8 }, { source: "albamon", listingOnly: 0, detailComplete: 0, unknown: 8 }],
  mapCoverage: { eligible: 8, listOnly: 38, percentage: 17.4, bySource: [{ source: "jobkorea", eligible: 4, total: 38, percentage: 10.5 }, { source: "albamon", eligible: 4, total: 8, percentage: 50 }] },
  effectiveness: { runs: 2, selectedCandidates: 50, detailAttempts: 50, successfulDetailParses: 0, listingFallbacks: 50, inserted: 30, updated: 20, unchanged: 0, lowerCompletenessSkips: 0, failedItems: 0, excludedCandidates: null, validRecordYield: 100, insertUpdateYield: 100, listingFallbackRate: 100, failureRate: 0 },
  exclusions: { runsUsingExclusions: 0, candidatesBefore: null, candidatesExcluded: null, candidatesAfter: null, exclusionRate: null, topKeywords: [], fields: [] },
  recentRuns: [{ id: "11111111-1111-4111-8111-111111111111", source: "jobkorea", presetId: null, presetLabel: null, status: "completed", startedAt: "2026-08-06T00:00:00Z", completedAt: "2026-08-06T00:00:10Z", selectedCandidates: 20, inserted: 0, updated: 20, unchanged: 0, skipped: 0, failed: 0, excluded: null, durationMs: 10_000 }],
};

const runDetail = { ...dashboard.recentRuns[0], ingestionType: "jobkorea_one_shot_transport", keyword: null, requestedRegions: null, pages: 2, maxCandidates: 20,
  exclusionKeywords: null, exclusionFields: null, candidatesBeforeExclusion: null, detailAttempts: 20, successfulDetailParses: 0, listingFallbacks: 20,
  permissionStatus: "unverified", provenanceType: "bounded_listing_collection", failureSummaries: [] };

function mockApi(active: unknown = null) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/active")) return new Response(JSON.stringify({ run: active }), { status: 200 });
    if (url.includes("/runs/")) return new Response(JSON.stringify({ run: runDetail }), { status: 200 });
    if (url.includes("/recent")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
    return new Response(JSON.stringify({ dashboard }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock); return fetchMock;
}

describe("CollectionDashboard", () => {
  it("defaults to an accessible overview with inventory, source, coverage, and legacy missing labels", async () => {
    mockApi(); render(<CollectionDashboard enabled presets={Object.values(COLLECTION_PRESETS)} />);
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "프로필 비교" })).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByText("전체 재고")).toBeInTheDocument();
    expect(screen.getByText("46", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "소스 현황" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지역 범위" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지도 범위" })).toBeInTheDocument();
    expect(screen.getAllByText("정보 없음").length).toBeGreaterThan(0);
  });

  it("filters run analytics, refreshes, and loads a keyboard-selectable run detail", async () => {
    const fetchMock = mockApi(); render(<CollectionDashboard enabled presets={Object.values(COLLECTION_PRESETS)} />);
    await screen.findByText("최근 실제 수집");
    fireEvent.change(screen.getByLabelText("기간"), { target: { value: "7d" } });
    fireEvent.change(screen.getByLabelText("소스"), { target: { value: "jobkorea" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("period=7d") && String(url).includes("source=jobkorea"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /2026/ }));
    expect(await screen.findByRole("heading", { name: "선택한 실행 상세" })).toBeInTheDocument();
    expect(screen.getAllByText("이전 형식").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "수집 현황 새로고침" }));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("preserves the collection execution controls and shows an active-run banner on either tab", async () => {
    const active = { runId: "active", source: "jobkorea", presetLabel: "서울 AI 일자리", mode: "dry_run", message: "목록 1/1 페이지 수집 중", listingPagesCompleted: 0, listingPagesRequested: 1, selectedCandidates: 0, elapsedMs: 1000 };
    mockApi(active); render(<CollectionDashboard enabled presets={Object.values(COLLECTION_PRESETS)} />);
    expect(await screen.findByText(/실행 중 · 잡코리아/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "실행 화면으로 이동" }));
    expect(screen.getByRole("tab", { name: "수집 실행" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "1. 프리셋 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "드라이런 실행" })).toBeInTheDocument();
  });

  it("explains the disabled local-only state without exposing execution", () => {
    render(<CollectionDashboard enabled={false} presets={Object.values(COLLECTION_PRESETS)} />);
    expect(screen.getByRole("status")).toHaveTextContent("NEARBY_JOBS_ENABLE_COLLECTION_UI=1");
  });
});
