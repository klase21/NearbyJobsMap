import { describe, expect, it } from "vitest";
import type { CanonicalJob } from "../../domain/canonical-job";
import type { JobFilterState, UiJobRecord } from "../../domain/ui-job";
import { createPreferencesRepository, DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, type StorageLike } from "../../repositories/preferences-repository";
import { DEFAULT_FILTERS, filterJobs, isMapEligible } from "../../services/job-search";
import { canonicalJob } from "../factories";

const record = (overrides: Partial<CanonicalJob>, coordinates = false): UiJobRecord => ({ job: canonicalJob(overrides), isFictional: false,
  safeSourceUrl: overrides.sourceUrl ?? canonicalJob().sourceUrl, mapPosition: coordinates ? { latitude: 37.5, longitude: 127, kind: "exact", provenance: "source" } : null });
const filters = (value: Partial<JobFilterState>): JobFilterState => ({ ...DEFAULT_FILTERS, ...value, salaryThresholds: { ...DEFAULT_FILTERS.salaryThresholds } });

class MemoryStorage implements StorageLike {
  values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); }
}

describe("display-only exclusions", () => {
  it("combines after positive search and updates map eligibility counts", () => {
    const hidden = record({ id: "hidden", title: "AI 강사", sourcePostingId: "hidden" }, true);
    const kept = record({ id: "kept", title: "AI 개발자", sourcePostingId: "kept" }, true);
    const result = filterJobs([hidden, kept], filters({ keyword: "AI", exclusionKeywords: ["강사"], exclusionFields: ["title"] }), new Date());
    expect(result.map(({ job }) => job.id)).toEqual(["kept"]); expect(result.filter(isMapEligible)).toHaveLength(1);
  });

  it("never matches unselected fields or the full description", () => {
    const candidate = record({ id: "kept", title: "AI 개발자", companyName: "강사 회사", descriptionSummary: "전기 업무" });
    expect(filterJobs([candidate], filters({ exclusionKeywords: ["강사", "전기"], exclusionFields: ["title"] }), new Date())).toHaveLength(1);
  });

  it("persists exclusions and ignores stale field values", () => {
    const storage = new MemoryStorage(); const repository = createPreferencesRepository(storage);
    repository.save({ ...DEFAULT_PREFERENCES, filters: { ...DEFAULT_PREFERENCES.filters, exclusionKeywords: ["강사"], exclusionFields: ["title"] } });
    expect(repository.load().value.filters).toMatchObject({ exclusionKeywords: ["강사"], exclusionFields: ["title"] });
    const raw = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!); raw.value.filters.exclusionFields = ["title", "__proto__"]; storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(raw));
    expect(createPreferencesRepository(storage).load().value.filters.exclusionFields).toEqual(["title"]);
  });
});
