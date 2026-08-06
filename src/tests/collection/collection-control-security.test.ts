import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertLocalCollectionAccess, collectionControlError } from "../../server/collection-control/access";
import { parseCollectionStartBody } from "../../server/collection-control/request-validation";

describe("collection control local boundary", () => {
  it("requires the feature flag", () => {
    expect(() => assertLocalCollectionAccess(new Request("http://localhost/api/collection-runs"), {})).toThrow(/비활성화/);
  });

  it("rejects non-local execution even with the feature flag", () => {
    expect(() => assertLocalCollectionAccess(new Request("https://example.com/api/collection-runs"), { NEARBY_JOBS_ENABLE_COLLECTION_UI: "1" })).toThrow(/로컬/);
    expect(() => assertLocalCollectionAccess(new Request("http://localhost/api/collection-runs", { headers: { "x-forwarded-for": "203.0.113.8" } }), { NEARBY_JOBS_ENABLE_COLLECTION_UI: "1" })).toThrow(/로컬/);
    expect(() => assertLocalCollectionAccess(new Request("http://localhost/api/collection-runs", { headers: { origin: "https://example.com" } }), { NEARBY_JOBS_ENABLE_COLLECTION_UI: "1" })).toThrow(/출처/);
  });

  it("allows a flagged localhost request and sanitizes errors", () => {
    expect(() => assertLocalCollectionAccess(new Request("http://127.0.0.1/api/collection-runs"), { NEARBY_JOBS_ENABLE_COLLECTION_UI: "1" })).not.toThrow();
    const safe = collectionControlError(Object.assign(new Error("safe"), { code: "SAFE", status: 409, stack: "secret" }));
    expect(safe).toEqual({ code: "SAFE", message: "safe", status: 409 });
    expect(safe).not.toHaveProperty("stack");
  });

  it("rejects arbitrary URLs, commands, and malformed typed fields", () => {
    expect(() => parseCollectionStartBody({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "dry_run", command: "rm" })).toThrow(/허용되지/);
    expect(() => parseCollectionStartBody({ presetId: "seoul-ai", pages: 1, maxDetails: 5, mode: "dry_run", searchUrl: "https://evil.invalid" })).toThrow(/허용되지/);
    expect(() => parseCollectionStartBody({ presetId: "seoul-ai", pages: "1", maxDetails: 5, mode: "dry_run" })).toThrow(/필요/);
  });
});
