import { afterEach, describe, expect, it } from "vitest";
import { normalizeSalary } from "../../services/salary-normalizer";
import { parseSalary } from "../../services/salary-parser";
import { JobRepository } from "../../db/repositories/job-repository";
import type { IngestionMetadata } from "../../db/schema";
import { canonicalJob } from "../factories";
import { createTestDatabase, type TestDatabase } from "./test-database";

const fixtureMetadata: IngestionMetadata = {
  recordKind: "fixture_derived", evidenceType: "observed_json_ld",
  sourceFixtureReference: "src/sources/jobkorea/fixtures/detail-test.json", mapPosition: null,
};

let testDatabase: TestDatabase | null = null;
afterEach(() => { testDatabase?.cleanup(); testDatabase = null; });
const repository = () => {
  testDatabase = createTestDatabase();
  return new JobRepository(testDatabase.database);
};

describe("SQLite canonical job repository", () => {
  it("CanonicalJob을 삽입하고 nullable 필드와 배열 순서를 복원한다", () => {
    const jobs = repository();
    const input = canonicalJob({ categories: ["물류", "포장"], employmentTypes: ["정규직", "계약직"], modifiedAt: null, parcelAddress: null });
    expect(jobs.upsert(input, fixtureMetadata).action).toBe("inserted");
    const loaded = jobs.findById(input.id);
    expect(loaded).toMatchObject({ modifiedAt: null, parcelAddress: null, categories: ["물류", "포장"], employmentTypes: ["정규직", "계약직"] });
  });

  it("연봉 범위와 월 환산 추정치를 손실 없이 보존한다", () => {
    const jobs = repository();
    const salary = normalizeSalary(parseSalary("연봉 3,500만~4,500만원"));
    jobs.upsert(canonicalJob({ salary }), fixtureMetadata);
    expect(jobs.findById("jobkorea:1")?.salary).toMatchObject({ type: "annual", minimumAmount: 35_000_000, maximumAmount: 45_000_000, normalizedMonthlyMinimum: 2_916_667, normalizedMonthlyMaximum: 3_750_000 });
  });

  it("복수 근무지 순서와 서로 다른 좌표를 구조적으로 복원한다", () => {
    const jobs = repository();
    const workplaces = [
      { ...canonicalJob().workplaces[0]!, originalText: "서울 지점", latitude: 37.5, longitude: 127, accuracy: "exact_coordinate" as const },
      { ...canonicalJob().workplaces[0]!, originalText: "경기 지점", latitude: null, longitude: null, accuracy: "district" as const },
    ];
    jobs.upsert(canonicalJob({ locationAccuracy: "multiple_locations", addressOriginalText: "서울 · 경기", roadAddress: null, city: null, district: null, neighborhood: null, latitude: null, longitude: null, workplaceCount: 2, workplaces }), fixtureMetadata);
    const loaded = jobs.findById("jobkorea:1");
    expect(loaded?.workplaces.map(({ originalText }) => originalText)).toEqual(["서울 지점", "경기 지점"]);
    expect(loaded?.workplaces.map(({ latitude }) => latitude)).toEqual([37.5, null]);
    expect(loaded?.roadAddress).toBeNull();
  });

  it("근무지 미정은 원문만 남기고 주소·좌표·workplaces를 비운다", () => {
    const jobs = repository();
    jobs.upsert(canonicalJob({ addressOriginalText: "근무지 면접 후 결정", roadAddress: null, parcelAddress: null, city: null, district: null, neighborhood: null, nearestStation: null, latitude: null, longitude: null, locationAccuracy: "location_undecided", workplaceCount: null, workplaces: [] }), fixtureMetadata);
    expect(jobs.findById("jobkorea:1")).toMatchObject({ addressOriginalText: "근무지 면접 후 결정", roadAddress: null, latitude: null, longitude: null, locationAccuracy: "location_undecided", workplaces: [] });
  });

  it("fixture와 fictional provenance 및 가상 지도 위치를 분리해 복원한다", () => {
    const jobs = repository();
    const demoMetadata: IngestionMetadata = { recordKind: "fictional_demo", evidenceType: "fictional_demo", sourceFixtureReference: "src/data/demo-jobs.ts#demo:1", mapPosition: { latitude: 37.4, longitude: 127, kind: "estimated", provenance: "fictional_demo" } };
    jobs.upsert(canonicalJob({ id: "demo:1", sourcePostingId: "demo-1", sourceUrl: "", canonicalUrl: null }), demoMetadata);
    const record = jobs.listUiRecords().records[0];
    expect(record).toMatchObject({ isFictional: true, safeSourceUrl: null, mapPosition: { kind: "estimated", provenance: "fictional_demo" } });
  });

  it("동일 exact source identity의 변경은 update하고 자식 컬렉션을 원자적으로 교체한다", () => {
    const jobs = repository();
    jobs.upsert(canonicalJob({ categories: ["기존"] }), fixtureMetadata);
    const changed = jobs.upsert(canonicalJob({ id: "다른-local-id", title: "변경", categories: ["신규", "추가"], employmentTypes: ["계약직"] }), fixtureMetadata);
    expect(changed.action).toBe("updated");
    expect(jobs.listAll()).toHaveLength(1);
    expect(jobs.findBySourceIdentity("jobkorea", "1")).toMatchObject({ id: "jobkorea:1", title: "변경", categories: ["신규", "추가"], employmentTypes: ["계약직"] });
  });

  it("같은 내용은 unchanged이며 content hash와 updated_at을 바꾸지 않는다", () => {
    const jobs = repository();
    const job = canonicalJob();
    const first = jobs.upsert(job, fixtureMetadata);
    const before = testDatabase!.database.prepare("SELECT updated_at FROM jobs WHERE id = ?").get(job.id) as { updated_at: string };
    const second = jobs.upsert({ ...job, collectedAt: "2099-01-01", lastVerifiedAt: "2099-01-02" }, fixtureMetadata);
    const after = testDatabase!.database.prepare("SELECT updated_at FROM jobs WHERE id = ?").get(job.id) as { updated_at: string };
    expect(second).toMatchObject({ action: "unchanged", contentHash: first.contentHash });
    expect(after.updated_at).toBe(before.updated_at);
  });

  it("같은 posting ID라도 다른 source는 자동 병합하지 않는다", () => {
    const jobs = repository();
    jobs.upsert(canonicalJob(), fixtureMetadata);
    jobs.upsert(canonicalJob({ id: "albamon:1", source: "albamon", sourceUrl: "https://www.albamon.com/jobs/detail/1", canonicalUrl: "https://www.albamon.com/jobs/detail/1" }), { ...fixtureMetadata, sourceFixtureReference: "src/sources/albamon/fixtures/test.json" });
    expect(jobs.listAll().map(({ id }) => id)).toEqual(["jobkorea:1", "albamon:1"]);
  });

  it("posting ID가 비어 있으면 source와 정규 canonical URL을 fallback identity로 사용한다", () => {
    const jobs = repository();
    const first = canonicalJob({ id: "jobkorea:url-1", sourcePostingId: "", canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1?utm_source=test" });
    const second = canonicalJob({ id: "jobkorea:url-2", sourcePostingId: "", title: "URL 신원 변경", canonicalUrl: "https://www.jobkorea.co.kr/Recruit/GI_Read/1?utm_source=test" });
    expect(jobs.upsert(first, fixtureMetadata).action).toBe("inserted");
    expect(jobs.upsert(second, fixtureMetadata).action).toBe("updated");
    expect(jobs.listAll()).toHaveLength(1);
    expect(jobs.listAll()[0]).toMatchObject({ id: "jobkorea:url-1", title: "URL 신원 변경" });
  });

  it("유효하지 않은 row는 다른 정상 공고를 막지 않고 진단한다", () => {
    const jobs = repository();
    jobs.upsert(canonicalJob(), fixtureMetadata);
    jobs.upsert(canonicalJob({ id: "jobkorea:2", sourcePostingId: "2" }), fixtureMetadata);
    testDatabase!.database.pragma("ignore_check_constraints = ON");
    testDatabase!.database.prepare("UPDATE jobs SET posting_status = 'broken' WHERE id = 'jobkorea:2'").run();
    const result = jobs.listAllWithDiagnostics();
    expect(result.records.map(({ job }) => job.id)).toEqual(["jobkorea:1"]);
    expect(result.diagnostics).toEqual([expect.objectContaining({ jobId: "jobkorea:2", code: "INVALID_ENUM_ROW" })]);
  });
});
