import { describe, expect, it } from "vitest";
import { classifyPostingStatus } from "../../services/posting-lifecycle";

const now = new Date("2026-08-05T00:00:00Z");

describe("공고 생명주기", () => {
  it("미래 마감은 active", () => expect(classifyPostingStatus({ expiresAt: "2026-08-20T00:00:00Z" }, now)).toBe("active"));
  it("3일 이내 마감은 closing_soon", () => expect(classifyPostingStatus({ expiresAt: "2026-08-07T00:00:00Z" }, now)).toBe("closing_soon"));
  it("지난 마감은 expired", () => expect(classifyPostingStatus({ expiresAt: "2026-08-04T00:00:00Z" }, now)).toBe("expired"));
  it("명시적 마감은 closed", () => expect(classifyPostingStatus({ explicitClosed: true, expiresAt: "2026-09-01" }, now)).toBe("closed"));
  it("직접 관찰된 제거만 removed", () => expect(classifyPostingStatus({ explicitlyRemoved: true }, now)).toBe("removed"));
  it("마감 근거가 없으면 unknown", () => expect(classifyPostingStatus({}, now)).toBe("unknown"));
});
