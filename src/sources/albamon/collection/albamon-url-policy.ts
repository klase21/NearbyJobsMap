import type { AlbamonAreaCode } from "./albamon-region-evidence";

const ALLOWED_HOSTS = new Set(["www.albamon.com", "m.albamon.com"]);
const DETAIL_PATH = /^\/jobs\/detail\/(\d+)\/?$/;

function parseHttps(value: string, base = "https://www.albamon.com"): URL {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || url.username || url.password || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("ALBAMON_URL_NOT_ALLOWED");
  }
  return url;
}

export function buildAlbamonListingUrl(page: number, areaCode: AlbamonAreaCode | null = null): string {
  if (!Number.isInteger(page) || page < 1 || page > 5) throw new Error("ALBAMON_PAGE_INVALID");
  if (areaCode !== null && areaCode !== "I000" && areaCode !== "B000") throw new Error("ALBAMON_AREA_CODE_INVALID");
  const url = new URL("https://www.albamon.com/jobs/total");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sortType", "POSTED_DATE");
  url.searchParams.set("size", "50");
  url.searchParams.set("searchPeriodType", "TODAY");
  url.searchParams.set("excludeBar", "true");
  if (areaCode) url.searchParams.set("areas", areaCode);
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
