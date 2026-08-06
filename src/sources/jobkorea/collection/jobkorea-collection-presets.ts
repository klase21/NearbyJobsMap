import type { CollectionRegion } from "../../../services/region-normalizer";
import { normalizeJobKoreaSearchUrl } from "../transport/jobkorea-url-policy";

export interface JobKoreaCollectionPreset {
  id: "seoul-ai" | "gyeonggi-ai" | "capital-ai";
  label: string;
  keyword: string;
  regions: CollectionRegion[];
  pages: 1 | 2 | 3 | 4 | 5;
  maxDetails: number;
  allowListingFallback: boolean;
  source: "jobkorea";
}

export const JOBKOREA_COLLECTION_PRESETS: Readonly<Record<JobKoreaCollectionPreset["id"], JobKoreaCollectionPreset>> = {
  "seoul-ai": { id: "seoul-ai", source: "jobkorea", label: "서울 AI 일자리", keyword: "AI", regions: ["seoul"], pages: 3, maxDetails: 30, allowListingFallback: true },
  "gyeonggi-ai": { id: "gyeonggi-ai", source: "jobkorea", label: "경기 AI 일자리", keyword: "AI", regions: ["gyeonggi"], pages: 3, maxDetails: 30, allowListingFallback: true },
  "capital-ai": { id: "capital-ai", source: "jobkorea", label: "서울·경기 AI 일자리", keyword: "AI", regions: ["seoul", "gyeonggi"], pages: 5, maxDetails: 50, allowListingFallback: true },
};

export function getJobKoreaCollectionPreset(value: string): JobKoreaCollectionPreset | null {
  return JOBKOREA_COLLECTION_PRESETS[value as JobKoreaCollectionPreset["id"]] ?? null;
}

export function buildJobKoreaKeywordSearchUrl(keyword: string): string {
  const url = new URL("https://www.jobkorea.co.kr/Search");
  url.searchParams.set("stext", keyword.trim());
  url.searchParams.set("tabType", "recruit");
  url.searchParams.set("Page_No", "1");
  return normalizeJobKoreaSearchUrl(url.toString());
}
