import { describe, expect, it } from "vitest";
import { createPreferencesRepository, DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, type StorageLike } from "../../repositories/preferences-repository";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("버전형 로컬 설정 저장소", () => {
  it("저장 후 검증된 값을 읽는다", () => {
    const storage = new MemoryStorage(); const repository = createPreferencesRepository(storage);
    expect(repository.save({ ...DEFAULT_PREFERENCES, sort: "distance" })).toBe(true);
    expect(repository.load()).toMatchObject({ corrupted: false, value: { sort: "distance" } });
  });
  it("손상 JSON은 기본값으로 복구", () => {
    const storage = new MemoryStorage(); storage.setItem(PREFERENCES_STORAGE_KEY, "{broken");
    expect(createPreferencesRepository(storage).load()).toEqual({ value: DEFAULT_PREFERENCES, corrupted: true });
  });
  it("잘못된 출발지는 거부", () => {
    const storage = new MemoryStorage(); storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, value: { ...DEFAULT_PREFERENCES, origin: { name: "x", latitude: 999, longitude: 0, example: false } } }));
    expect(createPreferencesRepository(storage).load().corrupted).toBe(true);
  });
  it("허용되지 않은 필터 열거값은 거부", () => {
    const storage = new MemoryStorage(); storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, value: { ...DEFAULT_PREFERENCES, filters: { ...DEFAULT_PREFERENCES.filters, source: "work24" } } }));
    expect(createPreferencesRepository(storage).load()).toEqual({ value: DEFAULT_PREFERENCES, corrupted: true });
  });
  it("이전 version 1 설정에는 새 필터 기본값을 안전하게 보완한다", () => {
    const storage = new MemoryStorage();
    const legacy = { ...DEFAULT_PREFERENCES, filters: Object.fromEntries(Object.entries(DEFAULT_PREFERENCES.filters).filter(([key]) => !["provenance","completeness","mapEligibility"].includes(key))) };
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, value: legacy }));
    expect(createPreferencesRepository(storage).load()).toMatchObject({ corrupted: false, value: { filters: { provenance: "all", completeness: "all", mapEligibility: "all" } } });
  });
  it("새 필터 선택을 저장하고 복원한다", () => {
    const storage = new MemoryStorage(); const repository = createPreferencesRepository(storage);
    repository.save({ ...DEFAULT_PREFERENCES, filters: { ...DEFAULT_PREFERENCES.filters, provenance: "manual", completeness: "listing_only", region: "seoul", mapEligibility: "list_only" } });
    expect(repository.load()).toMatchObject({ corrupted: false, value: { filters: { provenance: "manual", completeness: "listing_only", region: "seoul", mapEligibility: "list_only" } } });
  });
});
