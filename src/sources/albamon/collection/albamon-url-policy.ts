import type { AlbamonAreaFilter } from "./albamon-region-evidence";

const ALLOWED_HOSTS = new Set(["www.albamon.com", "m.albamon.com"]);
const DETAIL_PATH = /^\/jobs\/detail\/(\d+)\/?$/;

function parseHttps(value: string, base = "https://www.albamon.com"): URL {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || url.username || url.password || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("ALBAMON_URL_NOT_ALLOWED");
  }
  return url;
}

export function buildAlbamonListingUrl(page: number, areaCode: AlbamonAreaFilter | null = null, maximumPage = 5): string {
  if (!Number.isInteger(page) || page < 1 || page > maximumPage || ![5, 20, 50, 100].includes(maximumPage)) throw new Error("ALBAMON_PAGE_INVALID");
  if (areaCode !== null && areaCode !== "I000" && areaCode !== "B000" && areaCode !== "I000,B000") throw new Error("ALBAMON_AREA_CODE_INVALID");
  const url = new URL("https://www.albamon.com/jobs/total");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sortType", "POSTED_DATE");
  url.searchParams.set("size", "50");
  url.searchParams.set("searchPeriodType", "TODAY");
  url.searchParams.set("excludeBar", "true");
  if (areaCode) url.searchParams.set("areas", areaCode);
  return url.toString();
}

export const ALBAMON_HISTORICAL_BACKFILL_HARD_MAX_PAGES = 500;
export const ALBAMON_LISTING_PAGE_SIZE = 50;

export function isAlbamonSourceTotalExhausted(page: number, sourceTotalCount: number | null | undefined): boolean {
  return Number.isInteger(page) && page > 0 && Number.isInteger(sourceTotalCount) && Number(sourceTotalCount) >= 0
    && page * ALBAMON_LISTING_PAGE_SIZE >= Number(sourceTotalCount);
}

export type AlbamonHistoricalSort = "POSTED_DATE" | "MONTHLY_SALARY";

export function buildAlbamonHistoricalListingUrl(page: number, areaCode: AlbamonAreaFilter = "I000,B000", maximumPage = ALBAMON_HISTORICAL_BACKFILL_HARD_MAX_PAGES, exclusionKeywords: readonly string[] = [], sortType: AlbamonHistoricalSort = "POSTED_DATE"): string {
  if (!Number.isInteger(page) || page < 1 || page > maximumPage || maximumPage < 1 || maximumPage > ALBAMON_HISTORICAL_BACKFILL_HARD_MAX_PAGES) throw new Error("ALBAMON_PAGE_INVALID");
  if (areaCode !== "I000" && areaCode !== "B000" && areaCode !== "I000,B000") throw new Error("ALBAMON_AREA_CODE_INVALID");
  const url = new URL("https://www.albamon.com/jobs/total");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sortType", sortType);
  url.searchParams.set("size", String(ALBAMON_LISTING_PAGE_SIZE));
  url.searchParams.set("searchPeriodType", "ALL");
  url.searchParams.set("excludeBar", "true");
  url.searchParams.set("areas", areaCode);
  if (exclusionKeywords.length) url.searchParams.set("excludeKeywords", exclusionKeywords.join(","));
  return url.toString();
}

export function normalizeAlbamonListingUrl(value: string): string {
  const url = parseHttps(value);
  if (url.pathname.replace(/\/$/, "") !== "/jobs/total") throw new Error("ALBAMON_LISTING_URL_INVALID");
  return url.toString();
}

export function normalizeAlbamonDetailUrl(value: string): { postingId: string; canonicalUrl: string } {
  const url = parseHttps(value);
  const match = url.pathname.match(DETAIL_PATH);
  if (!match) throw new Error("ALBAMON_DETAIL_URL_INVALID");
  return { postingId: match[1]!, canonicalUrl: `https://www.albamon.com/jobs/detail/${match[1]}` };
}
