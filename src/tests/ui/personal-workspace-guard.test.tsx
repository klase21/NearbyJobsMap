// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NearbyJobsDashboard } from "../../components/dashboard/NearbyJobsDashboard";
import type { UiJobRecord } from "../../domain/ui-job";
import type { JobsPageResult } from "../../server/jobs-page/contracts";
import { canonicalJob } from "../factories";

const record: UiJobRecord = {
  job: canonicalJob(),
  isFictional: false,
  safeSourceUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1",
  mapPosition: null,
  provenanceKind: "live_one_shot_observation",
  observationKind: "bounded_listing_collection",
};

const page: JobsPageResult = {
  items: [record],
  userStates: [],
  freshness: [],
  duplicateGroups: [],
  pagination: {
    page: 1,
    pageSize: 50,
    totalItems: 1,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  },
  summary: {
    total: 1,
    filtered: 1,
    exact: 0,
    todayOrClosing: 0,
    jobKorea: 1,
    albamon: 0,
    mapEligible: 0,
  },
  facets: {
    total: 1,
    sources: { jobkorea: 1, albamon: 0 },
    provenance: { manual: 1, fixture: 0, demo: 0 },
    completeness: { listing_only: 1, detail_complete: 0 },
    regions: { seoul: 1 },
    mapEligible: 0,
    cities: [],
    districts: [],
    categories: [],
    employmentTypes: [],
    experienceRequirements: [],
    educationRequirements: [],
  },
  diagnostics: [],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("personal workspace persistence failure", () => {
  it("does not retry an unchanged failed PATCH in a render loop", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/api/job-user-state/")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "WRITE_FAILED",
              message: "개인 지원 정보를 저장하지 못했습니다.",
            },
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/saved-job-views")) {
        return new Response(JSON.stringify({ views: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/jobs")) {
        return new Response(JSON.stringify(page), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NearbyJobsDashboard initialPage={page} />);
    const favorite = await screen.findByRole("button", { name: /^☆ 관심$/ });
    fireEvent.click(favorite);
    fireEvent.click(favorite);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "개인 지원 정보를 저장하지 못했습니다.",
      ),
    );
    const patches = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).includes("/api/job-user-state/") && init?.method === "PATCH",
    );
    expect(patches).toHaveLength(1);
  });

  it("defaults the server-backed personal exclusions on and can request the raw universe", async () => {
    const personalPage: JobsPageResult = { ...page, personalExclusions: { applied: true, count: 244 } };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/saved-job-views")) return new Response(JSON.stringify({ views: [] }), { status: 200,
        headers: { "content-type": "application/json" } });
      if (url.includes("/api/jobs")) {
        const body = JSON.parse(String(init?.body)) as { applyPersonalExclusions: boolean };
        return new Response(JSON.stringify({ ...personalPage,
          personalExclusions: { applied: body.applyPersonalExclusions, count: 244 } }), { status: 200,
          headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NearbyJobsDashboard initialPage={personalPage} />);
    const toggle = screen.getByRole("checkbox", { name: "내 제외어 적용 (244개)" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => {
      const bodies = fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/jobs"))
        .map(([, init]) => JSON.parse(String(init?.body)) as { applyPersonalExclusions: boolean });
      expect(bodies.some((body) => body.applyPersonalExclusions === false)).toBe(true);
    });
    expect(toggle).not.toBeChecked();
  });
});
