// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppHeader } from "../../components/header/AppHeader";
import { DEFAULT_FILTERS } from "../../services/job-search";

afterEach(cleanup);
describe("collection navigation alignment", () => {
  it("keeps the exact label/link and applies a semantic centering class", () => {
    render(<AppHeader filters={DEFAULT_FILTERS} mapVisible={false} onFiltersChange={() => undefined} onToggleFilters={() => undefined} onToggleMap={() => undefined} availableSources={["jobkorea", "albamon"]} activeFilterCount={0} />);
    const link = screen.getByRole("link", { name: "수집 관리" }); expect(link).toHaveAttribute("href", "/collection"); expect(link).toHaveClass("button", "soft", "collection-nav-link"); expect(link).toHaveTextContent(/^수집 관리$/);
  });
  it("uses flex centering and controlled line-height without offset hacks", () => {
    const css = readFileSync("src/app/globals.css", "utf8"); const rule = css.match(/\.collection-nav-link\s*\{[^}]+\}/u)?.[0] ?? "";
    expect(rule).toContain("display: inline-flex"); expect(rule).toContain("align-items: center"); expect(rule).toContain("justify-content: center"); expect(rule).toContain("line-height: 1"); expect(rule).toContain("white-space: nowrap"); expect(rule).not.toMatch(/translateY|top\s*:|margin-top\s*:\s*-/u);
    expect(css).toContain(".header-actions .button { flex: 1; }");
  });
});
