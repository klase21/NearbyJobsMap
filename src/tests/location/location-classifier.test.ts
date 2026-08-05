import { describe, expect, it } from "vitest";
import { classifyLocation } from "../../services/location-classifier";

describe("위치 정확도 분류", () => {
  it.each([
    [{ latitude: 37.5, longitude: 127 }, "exact_coordinate"],
    [{ roadAddress: "서울 강남구 테헤란로 1" }, "exact_address"],
    [{ neighborhood: "역삼동" }, "neighborhood"],
    [{ district: "강남구" }, "district"],
    [{ city: "서울" }, "city"],
    [{ nearestStation: "강남역" }, "station_area"],
    [{ workplaceCount: 2, roadAddress: "서울 강남구 테헤란로 1" }, "multiple_locations"],
    [{ headquartersOnly: true, roadAddress: "서울 강남구 테헤란로 1" }, "headquarters_only"],
    [{ locationUndecided: true }, "location_undecided"],
    [{}, "unavailable"],
  ] as const)("%j → %s", (input, expected) => expect(classifyLocation(input)).toBe(expected));

  it("불완전한 좌표는 exact_coordinate로 분류하지 않는다", () => {
    expect(classifyLocation({ latitude: 37.5, city: "서울" })).toBe("city");
  });

  it("정확 주소가 없고 역 정보가 있으면 행정구역보다 station_area를 우선한다", () => {
    expect(classifyLocation({ city: "서울", district: "강남구", nearestStation: "강남역" })).toBe("station_area");
  });
});
