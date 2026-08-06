import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { CollectionRunManager } from "../../server/collection-control/collection-run-manager";

const result = { status: "completed", successfullyParsed: 0, listingOnlyRecords: 1 } as never;
const database = () => ({ close: vi.fn() }) as never;

describe("collection run exclusion authorization", () => {
  it("binds normalized keywords and fields to the single-use dry-run authorization", async () => {
    const manager = new CollectionRunManager({ runCollection: vi.fn(async () => result), openReadonly: database, openWritable: database });
    const exclusion = { keywords: ["강사", "웨이터"], fields: ["title" as const, "category" as const] };
    const dry = manager.start({ presetId: "capital-ai", pages: 1, maxDetails: 10, mode: "dry_run", exclusion });
    await vi.waitFor(() => expect(manager.get(dry.runId)?.status).toBe("completed"));
    const completed = manager.get(dry.runId)!;
    expect(completed.exclusion).toEqual(exclusion); expect(completed.exclusionConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => manager.start({ presetId: "capital-ai", pages: 1, maxDetails: 10, mode: "write",
      exclusion: { ...exclusion, keywords: ["웨이터", "강사"] }, writeAuthorizationToken: completed.writeAuthorizationToken!, confirmationPhrase: "WRITE capital-ai" })).toThrow();
    const write = manager.start({ presetId: "capital-ai", pages: 1, maxDetails: 10, mode: "write", exclusion,
      writeAuthorizationToken: completed.writeAuthorizationToken!, confirmationPhrase: "WRITE capital-ai" });
    await vi.waitFor(() => expect(manager.get(write.runId)?.status).toBe("completed"));
  });
});
