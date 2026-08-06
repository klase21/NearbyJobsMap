import type { CollectionRegion } from "../../../services/region-normalizer";

export interface AlbamonCollectionPreset {
  id: "albamon-seoul-today" | "albamon-gyeonggi-today" | "albamon-capital-today";
  source: "albamon";
  label: string;
  regions: CollectionRegion[];
  pages: 1 | 2 | 3 | 4 | 5;
  maxDetails: number;
  listingOnly: true;
  searchPeriod: "today";
}

export const ALBAMON_COLLECTION_PRESETS: Readonly<Record<AlbamonCollectionPreset["id"], AlbamonCollectionPreset>> = {
  "albamon-seoul-today": { id: "albamon-seoul-today", source: "albamon", label: "알바몬 서울 오늘 등록", regions: ["seoul"], pages: 3, maxDetails: 30, listingOnly: true, searchPeriod: "today" },
  "albamon-gyeonggi-today": { id: "albamon-gyeonggi-today", source: "albamon", label: "알바몬 경기 오늘 등록", regions: ["gyeonggi"], pages: 3, maxDetails: 30, listingOnly: true, searchPeriod: "today" },
  "albamon-capital-today": { id: "albamon-capital-today", source: "albamon", label: "알바몬 서울·경기 오늘 등록", regions: ["seoul", "gyeonggi"], pages: 5, maxDetails: 50, listingOnly: true, searchPeriod: "today" },
};

export function getAlbamonCollectionPreset(value: string): AlbamonCollectionPreset | null {
  return ALBAMON_COLLECTION_PRESETS[value as AlbamonCollectionPreset["id"]] ?? null;
}
