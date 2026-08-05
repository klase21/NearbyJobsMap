import { describe, expect, it } from "vitest";
import { calculateJobContentHash } from "../../db/content-hash";
import { canonicalJob } from "../factories";

describe("canonical content hash", () => {
  it("수집 시각만 바뀌면 동일하고 의미 있는 내용이 바뀌면 달라진다", () => {
    const job = canonicalJob();
    expect(calculateJobContentHash(job)).toBe(calculateJobContentHash({ ...job, collectedAt: "2099-01-01", lastVerifiedAt: "2099-01-02" }));
    expect(calculateJobContentHash(job)).not.toBe(calculateJobContentHash({ ...job, title: "변경된 제목" }));
  });

  it("객체 key 순서와 null 처리에 독립적으로 결정적이다", () => {
    const job = canonicalJob();
    const reordered = { ...job, salary: { ...job.salary } };
    expect(calculateJobContentHash(job)).toMatch(/^[a-f0-9]{64}$/);
    expect(calculateJobContentHash(job)).toBe(calculateJobContentHash(reordered));
  });
});
