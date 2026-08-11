// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppHeader } from "../../components/header/AppHeader";
import { FirstRunOnboarding } from "../../components/onboarding/FirstRunOnboarding";
import { DEFAULT_FILTERS } from "../../services/job-search";

afterEach(cleanup);
describe("collection navigation alignment", () => {
  it("keeps the exact label/link and applies a semantic centering class", () => {
    render(<AppHeader filters={DEFAULT_FILTERS} mapVisible={false} onFiltersChange={() => undefined} onToggleFilters={() => undefined} onToggleMap={() => undefined} availableSources={["jobkorea", "albamon"]} activeFilterCount={0} />);
    const link = screen.getByRole("link", { name: "수집 관리" }); expect(link).toHaveAttribute("href", "/collection"); expect(link).toHaveClass("button", "soft", "collection-nav-link"); expect(link).toHaveTextContent(/^수집 관리$/);
  });
  it("centers both collection links through the shared button contract", () => {
    render(<FirstRunOnboarding forceOpen />);
    for (let step = 0; step < 5; step += 1) fireEvent.click(screen.getByRole("button", { name: step === 0 ? "시작하기" : "다음" }));
    const action = screen.getByRole("link", { name: "수집관리로 이동" });
    expect(action).toHaveAttribute("href", "/collection");
    expect(action).toHaveClass("button", "soft", "collection-nav-link");

    const css = readFileSync("src/app/globals.css", "utf8");
    const buttonRule = css.match(/(?:^|\n)\.button\s*\{[^}]+\}/u)?.[0] ?? "";
    const linkRule = css.match(/\.collection-nav-link\s*\{[^}]+\}/u)?.[0] ?? "";
    expect(buttonRule).toContain("display: inline-flex"); expect(buttonRule).toContain("align-items: center"); expect(buttonRule).toContain("justify-content: center"); expect(buttonRule).toContain("line-height: 1");
    expect(linkRule).toContain("display: inline-flex"); expect(linkRule).toContain("align-items: center"); expect(linkRule).toContain("justify-content: center"); expect(linkRule).toContain("line-height: 1"); expect(linkRule).toContain("white-space: nowrap");
    expect(linkRule).not.toMatch(/translateY|transform\s*:|position\s*:\s*relative|top\s*:|margin-top\s*:\s*-/u);
    expect(css).toContain(".header-actions .button { flex: 1; }");
  });
  it("centers the collection page and tab labels without positional nudges", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const pageRule = css.match(/\.collection-page\s*\{[^}]+\}/u)?.[0] ?? "";
    const tabRule = css.match(/\.collection-tabs button\s*\{[^}]+\}/u)?.[0] ?? "";
    expect(pageRule).toContain("width:100%"); expect(pageRule).toContain("max-width:1280px"); expect(pageRule).toContain("margin-inline:auto");
    expect(tabRule).toContain("display:inline-flex"); expect(tabRule).toContain("align-items:center"); expect(tabRule).toContain("justify-content:center"); expect(tabRule).toContain("line-height:1");
    expect(pageRule + tabRule).not.toMatch(/translateY|transform\s*:|position\s*:\s*relative|top\s*:|margin-top\s*:\s*-/u);
  });
  it.each([1600, 1280, 1024, 768, 430, 390, 320])("retains the shared centered, non-wrapping contract at %ipx", (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    window.dispatchEvent(new Event("resize"));
    render(<AppHeader filters={DEFAULT_FILTERS} mapVisible={false} onFiltersChange={() => undefined} onToggleFilters={() => undefined} onToggleMap={() => undefined} availableSources={["jobkorea", "albamon"]} activeFilterCount={0} />);
    expect(screen.getByRole("link", { name: "수집 관리" })).toHaveClass("button", "collection-nav-link");
    cleanup();
    render(<FirstRunOnboarding forceOpen />);
    for (let step = 0; step < 5; step += 1) fireEvent.click(screen.getByRole("button", { name: step === 0 ? "시작하기" : "다음" }));
    expect(screen.getByRole("link", { name: "수집관리로 이동" })).toHaveClass("button", "collection-nav-link");
  });
});
