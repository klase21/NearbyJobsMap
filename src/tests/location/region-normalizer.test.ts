import { describe, expect, it } from "vitest";
import { normalizeRegionText } from "../../services/region-normalizer";

describe("수집 지역 정규화", () => {
  it.each(["서울", "서울특별시", "서울 전지역", "서울전체"])("서울 직접 표기: %s", (value) => {
    expect(normalizeRegionText(value)).toMatchObject({ regions: ["seoul"], confidence: "exact", originalText: value });
  });
  it.each(["강남구", "서초구", "송파구", "영등포구", "마포구"])("서울 구 매핑: %s", (value) => {
    expect(normalizeRegionText(value)).toMatchObject({ regions: ["seoul"], confidence: "mapped_city" });
  });
  it.each(["경기", "경기도", "경기 전지역", "경기전체"])("경기 직접 표기: %s", (value) => {
    expect(normalizeRegionText(value)).toMatchObject({ regions: ["gyeonggi"], confidence: "exact" });
  });
  it.each(["성남시", "수원시", "안양시", "군포시", "용인시", "고양시", "부천시", "화성시", "과천시", "광명시", "의왕시", "하남시", "남양주시", "김포시", "파주시"])("경기 시 매핑: %s", (value) => {
    expect(normalizeRegionText(value)).toMatchObject({ regions: ["gyeonggi"], confidence: "mapped_city" });
  });
  it("복수 지역을 모두 보존한다", () => expect(normalizeRegionText("서울 강남구 / 경기 성남시")).toMatchObject({ regions: ["seoul", "gyeonggi"], confidence: "multiple" }));
  it.each([null, "", "전국", "재택", "협의"])("미확인 위치: %s", (value) => expect(normalizeRegionText(value)).toMatchObject({ regions: [], confidence: "unknown" }));
  it("회사명이나 제목의 부분 문자열을 지역으로 오인하지 않는다", () => {
    expect(normalizeRegionText("서울상사 AI개발팀").regions).toEqual([]);
    expect(normalizeRegionText("경기력 향상 서비스").regions).toEqual([]);
  });
});
