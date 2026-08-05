import type { JobKoreaPageKind } from "./types";
import { JobKoreaTransportError } from "./jobkorea-error";

export const JOBKOREA_ALLOWED_HOSTS = new Set(["www.jobkorea.co.kr", "m.jobkorea.co.kr"]);
const TRACKING_KEYS = new Set(["oem_code", "logpath", "sc", "listno", "ref", "referrer"]);

function isAllowedPath(pathname: string, kind: Exclude<JobKoreaPageKind, "robots">): boolean {
  if (kind === "detail") return /^\/Recruit\/GI_Read\/\d+\/?$/i.test(pathname);
  return /^\/Search\/?$/i.test(pathname) || /^\/recruit\/joblist\/?$/i.test(pathname);
}

export function normalizeJobKoreaUrl(candidate: string, kind: JobKoreaPageKind): string {
  let url: URL;
  try { url = new URL(candidate); }
  catch { throw new JobKoreaTransportError("JOBKOREA_URL_INVALID", "절대 HTTPS URL이 필요합니다.", null); }
  if (url.protocol !== "https:") throw new JobKoreaTransportError("JOBKOREA_HTTPS_REQUIRED", "HTTPS URL만 허용합니다.", null);
  if (url.username || url.password) throw new JobKoreaTransportError("JOBKOREA_EMBEDDED_CREDENTIALS_REJECTED", "URL 내장 자격정보는 허용하지 않습니다.", null);
  url.hostname = url.hostname.toLowerCase();
  if (!JOBKOREA_ALLOWED_HOSTS.has(url.hostname)) throw new JobKoreaTransportError("JOBKOREA_HOST_REJECTED", "허용된 잡코리아 호스트가 아닙니다.", null);
  if (kind === "robots") {
    if (url.pathname !== "/robots.txt") throw new JobKoreaTransportError("JOBKOREA_URL_PATH_REJECTED", "robots.txt 경로만 허용합니다.", null);
  } else if (!isAllowedPath(url.pathname, kind)) {
    throw new JobKoreaTransportError(kind === "listing" ? "JOBKOREA_LISTING_URL_REJECTED" : "JOBKOREA_DETAIL_URL_REJECTED", "허용된 공개 페이지 경로가 아닙니다.", null);
  }
  url.hash = "";
  if (kind === "detail" || kind === "robots") url.search = "";
  else for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_") || TRACKING_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
  return url.toString();
}

export function validateJobKoreaRedirect(from: string, location: string, kind: JobKoreaPageKind): string {
  let resolved: URL;
  try { resolved = new URL(location, from); }
  catch { throw new JobKoreaTransportError("JOBKOREA_REDIRECT_REJECTED", "리다이렉트 URL을 해석할 수 없습니다.", from); }
  try { return normalizeJobKoreaUrl(resolved.toString(), kind); }
  catch (error) {
    throw new JobKoreaTransportError("JOBKOREA_REDIRECT_REJECTED", "허용되지 않은 호스트·프로토콜·경로로의 리다이렉트를 거부했습니다.", from, { cause: error });
  }
}

export function sourcePostingIdFromUrl(url: string): string | null {
  return new URL(url).pathname.match(/\/GI_Read\/(\d+)/i)?.[1] ?? null;
}
