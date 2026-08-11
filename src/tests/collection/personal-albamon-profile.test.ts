import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalAlbamonProfile } from "../../services/albamon-profile-import";
import { canonicalPersonalAlbamonProfile, normalizePersonalAlbamonProfile } from "../../services/personal-albamon-profile";
import { computePersonalAlbamonProfileHash, getPersonalAlbamonProfile, savePersonalAlbamonProfile } from "../../server/personal-albamon-profile/service";
import { formatPersonalBackfillProfilePreflight, resolveBackfillConfig } from "../../server/manual-backfill/profile-resolution";

let directory: string | null = null;
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); directory = null; vi.unstubAllGlobals(); });
const path = () => { directory = mkdtempSync(join(tmpdir(), "nearby-profile-")); return join(directory, "profile.json"); };
const input = (count = 244) => ({ areas: "I000,B000" as const, searchPeriodType: "ALL" as const,
  sortType: "MONTHLY_SALARY" as const, excludeBar: true as const,
  exclusions: Array.from({ length: count }, (_, index) => ` 제외어${index + 1} `) });

describe("server-readable personal Albamon profile", () => {
  it("returns an explicit unconfigured state when the local file is absent", () => {
    expect(getPersonalAlbamonProfile(path())).toEqual({ configured: false, profile: null, profileHash: null });
  });

  it("atomically saves and reads back a normalized 244-keyword profile", () => {
    const filePath = path();
    const saved = savePersonalAlbamonProfile(input(), { filePath, now: new Date("2026-08-11T01:00:00Z") });
    expect(saved.configured).toBe(true);
    expect(saved.profile?.albamon.exclusions).toHaveLength(244);
    expect(saved.profile?.albamon.exclusions[0]).toBe("제외어1");
    expect(getPersonalAlbamonProfile(filePath)).toEqual(saved);
    expect(readdirSync(directory!)).toEqual(["profile.json"]);
    const replaced = savePersonalAlbamonProfile({ ...input(), exclusions: ["변경 키워드"] }, { filePath, now: new Date("2026-08-11T02:00:00Z") });
    expect(replaced.profile?.albamon.exclusions).toEqual(["변경 키워드"]);
    expect(readdirSync(directory!)).toEqual(["profile.json"]);
  });

  it("rejects malformed persisted data instead of silently treating it as empty", () => {
    const filePath = path(); writeFileSync(filePath, "{broken", "utf8");
    expect(() => getPersonalAlbamonProfile(filePath)).toThrow("읽을 수 없습니다");
  });

  it("rejects an oversized local profile before parsing it", () => {
    const filePath = path(); writeFileSync(filePath, "x".repeat(128 * 1024 + 1), "utf8");
    expect(() => getPersonalAlbamonProfile(filePath)).toThrow("허용 크기를 초과했습니다");
  });

  it("shares one canonical hash contract with URL import and excludes page from authority", () => {
    const normalized = normalizePersonalAlbamonProfile(input(3));
    const imported = { keywords: normalized.exclusions, areas: normalized.areas, searchPeriodType: normalized.searchPeriodType,
      sortType: normalized.sortType, excludeBar: normalized.excludeBar };
    expect(canonicalAlbamonProfile(imported)).toBe(canonicalPersonalAlbamonProfile(normalized));
    expect(computePersonalAlbamonProfileHash(normalized)).toBe(computePersonalAlbamonProfileHash({ ...normalized, page: 500 }));
  });

  it("resolves CLI/backfill preflight from the server profile without browser state or network", () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const state = savePersonalAlbamonProfile(input(), { filePath: path() });
    const config = resolveBackfillConfig({ source: "albamon", scope: "albamon_personal_all", maxPages: 150 }, () => state);
    expect(config.exclusion.keywords).toHaveLength(244);
    expect(formatPersonalBackfillProfilePreflight(config)).toContain(`Exclusions: 244\nProfile hash: ${state.profileHash}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
