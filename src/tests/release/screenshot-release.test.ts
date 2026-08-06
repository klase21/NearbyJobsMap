import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APPROVED_SCREENSHOT_FILES, SCREENSHOT_SPECS, assertIsolatedScreenshotDatabase, isAllowedBrowserUrl } from "../../../scripts/docs/screenshot-contracts";

describe("documentation screenshot release contract", () => {
  it("uses only the six approved images and exact dimensions", () => {
    expect(APPROVED_SCREENSHOT_FILES).toHaveLength(6);
    expect(new Set(APPROVED_SCREENSHOT_FILES).size).toBe(6);
    expect(SCREENSHOT_SPECS.map(({ width, height }) => `${width}x${height}`)).toEqual(["1440x1000","1440x1100","1440x1100","1440x1100","390x844","390x844"]);
  });
  it("requires an isolated screenshot database", () => {
    expect(() => assertIsolatedScreenshotDatabase(resolve("artifacts/screenshot-work/demo.sqlite"))).not.toThrow();
    expect(() => assertIsolatedScreenshotDatabase(resolve("data/nearby-jobs.sqlite"))).toThrow();
  });
  it("allows only the selected loopback application origin", () => {
    expect(isAllowedBrowserUrl("http://127.0.0.1:4321/",4321)).toBe(true);
    expect(isAllowedBrowserUrl("https://tile.openstreetmap.org/1/2/3.png",4321)).toBe(false);
    expect(isAllowedBrowserUrl("https://www.jobkorea.co.kr/",4321)).toBe(false);
    expect(isAllowedBrowserUrl("https://www.albamon.com/",4321)).toBe(false);
  });
  it("documents every screenshot and release safety limitation", () => {
    const readme=readFileSync(resolve("README.md"),"utf8");
    for(const path of APPROVED_SCREENSHOT_FILES) expect(readme).toContain(path);
    expect(readme).toContain("정제된 데모 데이터");
    const notes=readFileSync(resolve("docs/RELEASE_NOTES_0.1.0.md"),"utf8");
    expect(notes).toContain("Albamon"); expect(notes).toContain("standalone executable");
    const checklist=readFileSync(resolve("docs/GITHUB_RELEASE_CHECKLIST.md"),"utf8");
    expect(checklist).toContain("실행하지 말고"); expect(checklist).not.toMatch(/github\.com\/[\w-]+\/NearbyJobsMap/iu);
  });
  it("preserves the navigation centering contract", () => {
    const css=readFileSync(resolve("src/app/globals.css"),"utf8");
    const rule=css.match(/\.collection-nav-link\s*\{([^}]+)\}/u)?.[1]??"";
    const button=css.match(/(?:^|\n)\.button\s*\{([^}]+)\}/u)?.[1]??"";
    expect(button).toContain("min-height: 42px"); expect(rule).toContain("inline-flex"); expect(rule).toContain("align-items: center"); expect(rule).toContain("justify-content: center");
    expect(rule).not.toMatch(/transform|top\s*:|margin-top\s*:\s*-/u);
  });
});
