// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPreferencesRepository } from "../../repositories/preferences-repository";
import { ManualBackfillPanel } from "../../components/collection/ManualBackfillPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("manual backfill panel", () => {
  const profileResponse = (keywords: string[]) => ({ configured: true, profile: { version: 1, albamon: {
    areas: "I000,B000", searchPeriodType: "ALL", sortType: "MONTHLY_SALARY", excludeBar: true, exclusions: keywords,
  }, updatedAt: "2026-08-11T01:00:00.000Z" }, profileHash: "PROFILE_HASH" });

  it("explains the collection guard when disabled", () => {
    render(<ManualBackfillPanel enabled={false} />);
    expect(screen.getByText(/수집 관리 기능이 비활성화/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "백필 실행" })).not.toBeInTheDocument();
  });

  it("defaults to the Albamon ALL-period personal profile and 150 pages", () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("personal-albamon-profile")
      ? { configured: false, profile: null, profileHash: null } : { runs: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualBackfillPanel enabled />);
    expect(screen.getByRole("heading", { name: "내 검색조건 전체 백필" })).toBeInTheDocument();
    expect(screen.getByLabelText("소스")).toHaveValue("albamon");
    expect(screen.queryByLabelText("기간")).not.toBeInTheDocument();
    expect(screen.getByLabelText("최대 페이지")).toHaveValue("150");
    expect(screen.getAllByRole("option").filter((option) => option.closest("select") === screen.getByLabelText("최대 페이지")).map((option) => option.getAttribute("value")))
      .toEqual(["50", "100", "150", "200", "300"]);
    expect(screen.getByText("서울 · 경기")).toBeInTheDocument();
    expect(screen.getByText("전체")).toBeInTheDocument();
    expect(screen.getByText(/서버 프로필 미설정/)).toBeInTheDocument();
    expect(screen.getByText(/급여와 거리는 저장 후 공고 목록에서 필터링/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "백필 미리보기" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "백필 실행" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("previews and explicitly persists the complete URL exclusion list without fetching the pasted URL", async () => {
    const keywords = Array.from({ length: 40 }, (_, index) => `제외어${index + 1}`);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = url.includes("personal-albamon-profile") && init?.method === "PUT"
        ? profileResponse(keywords)
        : url.includes("personal-albamon-profile") ? { configured: false, profile: null, profileHash: null } : { runs: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualBackfillPanel enabled />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = `https://www.albamon.com/jobs/total?searchPeriodType=ALL&sortType=MONTHLY_SALARY&areas=I000%2CB000&excludeKeywords=${keywords.map(encodeURIComponent).join("%2C")}&excludeBar=true&page=500`;
    fireEvent.change(screen.getByLabelText("알바몬 검색 URL"), { target: { value: url } });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 미리보기" }));
    expect(screen.getByText("제외 키워드 40개")).toBeInTheDocument();
    fireEvent.click(screen.getByText("제외어 전체 보기"));
    expect(screen.getByText("제외어1")).toBeInTheDocument();
    expect(screen.getByText("제외어40")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "제외어 저장" }));
    await waitFor(() => expect(screen.getByText(/서버에서 제외 키워드 40개를 저장/)).toBeInTheDocument());
    expect(createPreferencesRepository(window.localStorage).load().value.filters.exclusionKeywords).toEqual(keywords);
    expect(screen.getByText(/서버 검증 40개/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not verify or mirror an import until the server returns the complete saved profile", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(input).includes("personal-albamon-profile") && init?.method === "PUT"
        ? profileResponse(["서버가 잘라낸 값"])
        : String(input).includes("personal-albamon-profile") ? { configured: false, profile: null, profileHash: null } : { runs: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualBackfillPanel enabled />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = "https://www.albamon.com/jobs/total?searchPeriodType=ALL&sortType=MONTHLY_SALARY&areas=I000%2CB000&excludeKeywords=%EC%A0%9C%EC%99%B8%EC%96%B41%2C%EC%A0%9C%EC%99%B8%EC%96%B42&excludeBar=true";
    fireEvent.change(screen.getByLabelText("알바몬 검색 URL"), { target: { value: url } });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 미리보기" }));
    fireEvent.click(screen.getByRole("button", { name: "제외어 저장" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("다시 확인하지 못했습니다"));
    expect(createPreferencesRepository(window.localStorage).load().value.filters.exclusionKeywords).toEqual([]);
    expect(screen.getByText(/서버 프로필 미설정/)).toBeInTheDocument();
  });
});
