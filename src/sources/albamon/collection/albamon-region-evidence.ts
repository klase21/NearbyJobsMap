import type { CollectionRegion } from "../../../services/region-normalizer";

/**
 * Verified from the project's 2026-08-05 recorded Albamon area-code evidence.
 * These are public listing-filter values, not an official API contract.
 */
export const ALBAMON_AREA_CODE_BY_REGION = {
  seoul: "I000",
  gyeonggi: "B000",
} as const satisfies Record<CollectionRegion, string>;

export type AlbamonAreaCode = (typeof ALBAMON_AREA_CODE_BY_REGION)[CollectionRegion];
export const ALBAMON_CAPITAL_AREA_CODES = "I000,B000" as const;
export type AlbamonAreaFilter = AlbamonAreaCode | typeof ALBAMON_CAPITAL_AREA_CODES;

export function getAlbamonAreaCode(region: CollectionRegion): AlbamonAreaCode {
  const value = ALBAMON_AREA_CODE_BY_REGION[region];
  if (!value) throw new Error("ALBAMON_REGION_MAPPING_UNKNOWN");
  return value;
}

export function resolveAlbamonSingleRegionFilter(regions: CollectionRegion[]): { region: CollectionRegion; areaCode: AlbamonAreaCode } | null {
  if (regions.length !== 1) return null;
  const region = regions[0];
  return region ? { region, areaCode: getAlbamonAreaCode(region) } : null;
}

export function resolveAlbamonRegionFilter(regions: CollectionRegion[]): { regions: CollectionRegion[]; areaCode: AlbamonAreaFilter } | null {
  const unique = [...new Set(regions)];
  if (unique.length === 1) return { regions: unique, areaCode: getAlbamonAreaCode(unique[0]!) };
  if (unique.length === 2 && unique.includes("seoul") && unique.includes("gyeonggi")) {
    return { regions: ["seoul", "gyeonggi"], areaCode: ALBAMON_CAPITAL_AREA_CODES };
  }
  return null;
}
