import { describe, expect, it } from "vitest";
import { haversineDistanceKm, validateOrigin } from "../../services/distance";
import { DEFAULT_ORIGIN } from "../../repositories/preferences-repository";

describe("출발지와 직선거리", () => {
  it("동일 좌표는 0km", () => expect(haversineDistanceKm(DEFAULT_ORIGIN, { latitude: DEFAULT_ORIGIN.latitude, longitude: DEFAULT_ORIGIN.longitude, kind: "exact", provenance: "fictional_demo" })).toBe(0));
  it("범계역-서울 중심 거리를 양수로 계산", () => expect(haversineDistanceKm(DEFAULT_ORIGIN, { latitude: 37.5665, longitude: 126.978, kind: "exact", provenance: "fictional_demo" })).toBeGreaterThan(15));
  it("빈 이름과 범위 밖 좌표를 거부", () => expect(validateOrigin({ name: "", latitude: 91, longitude: 181 })).toHaveLength(3));
});
