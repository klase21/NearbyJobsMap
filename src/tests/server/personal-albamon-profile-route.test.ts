import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("../../server/personal-albamon-profile/service", () => ({
  getPersonalAlbamonProfile: mocks.get,
  savePersonalAlbamonProfile: mocks.save,
}));

import { GET, PUT } from "../../app/api/personal-albamon-profile/route";

afterEach(() => vi.clearAllMocks());

describe("personal Albamon profile API boundary", () => {
  it("reads the local server profile without the collection-management flag", async () => {
    delete process.env.NEARBY_JOBS_ENABLE_COLLECTION_UI;
    mocks.get.mockReturnValue({ configured: false, profile: null, profileHash: null });
    const response = await GET(new Request("http://localhost/api/personal-albamon-profile"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: false, profile: null, profileHash: null });
  });

  it("persists only a validated local profile and returns the service read-back", async () => {
    const input = { areas: "I000,B000", searchPeriodType: "ALL", sortType: "MONTHLY_SALARY",
      excludeBar: true, exclusions: ["제외어1", "제외어2"] };
    const saved = { configured: true, profile: { version: 1, albamon: input,
      updatedAt: "2026-08-11T01:00:00.000Z" }, profileHash: "HASH" };
    mocks.save.mockReturnValue(saved);
    const response = await PUT(new Request("http://localhost/api/personal-albamon-profile", { method: "PUT",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify(input) }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(input);
    expect(await response.json()).toEqual(saved);
  });

  it("rejects non-local profile access", async () => {
    const response = await GET(new Request("https://example.com/api/personal-albamon-profile"));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("PERSONAL_WORKSPACE_NON_LOCAL_REJECTED");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("returns a bounded validation error for an invalid local save", async () => {
    mocks.save.mockImplementation(() => { throw Object.assign(new Error("프로필 형식이 올바르지 않습니다."),
      { code: "PERSONAL_ALBAMON_PROFILE_INVALID", status: 400 }); });
    const response = await PUT(new Request("http://localhost/api/personal-albamon-profile", { method: "PUT",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ exclusions: [] }) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("PERSONAL_ALBAMON_PROFILE_INVALID");
  });
});
