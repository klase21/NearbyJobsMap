// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionControl } from "../../components/collection/CollectionControl";
import { JOBKOREA_COLLECTION_PRESETS } from "../../sources/jobkorea/collection/jobkorea-collection-presets";

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });

describe("collection exclusion controls", () => {
  it("adds comma/newline pasted keywords, removes duplicates, toggles fields, and clears", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("recent") ? { runs: [] } : { run: null }), { status: 200 })));
    render(<CollectionControl enabled presets={Object.values(JOBKOREA_COLLECTION_PRESETS)} />);
    const input = screen.getByLabelText(/키워드 \(쉼표 또는 줄바꿈 가능\)/);
    fireEvent.paste(input, { clipboardData: { getData: () => "전기, 강사\n전기" } });
    expect(await screen.findByText("전기")).toBeInTheDocument(); expect(screen.getByText("강사")).toBeInTheDocument(); expect(screen.getByText("2/30")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("회사명"));
    expect(screen.getByLabelText("회사명")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "전기 제외 키워드 제거" })); expect(screen.queryByText("전기")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모두 지우기" })); expect(screen.getByText("0/30")).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0));
  });
});
