import { chromium, type Browser, type BrowserServer } from "playwright";
import { ALBAMON_LISTING_EVALUATOR_SOURCE, toAlbamonListingPageResult } from "./albamon-listing-evaluator";
import { buildAlbamonListingUrl } from "./albamon-url-policy";
import type { AlbamonListingPageResult } from "./albamon-collection-types";

const NAVIGATION_TIMEOUT_MS = 15_000;
const READINESS_TIMEOUT_MS = 10_000;

export function classifyAlbamonNavigationFailure(error: unknown): string {
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/ERR_(?:NAME_NOT_RESOLVED|DNS)/i.test(value)) return "ALBAMON_LISTING_DNS_FAILED";
  if (/ERR_CERT|CERTIFICATE|SSL|TLS/i.test(value)) return "ALBAMON_LISTING_TLS_FAILED";
  if (/TimeoutError|TIMED_OUT|timeout/i.test(value)) return "ALBAMON_LISTING_NAVIGATION_TIMEOUT";
  return "ALBAMON_LISTING_NAVIGATION_FAILED";
}

export async function collectAlbamonListingPages(pages: 1 | 2 | 3 | 4 | 5): Promise<AlbamonListingPageResult[]> {
  let server: BrowserServer | null = null; let browser: Browser | null = null;
  const results: AlbamonListingPageResult[] = []; const seen = new Set<string>();
  try {
    server = await chromium.launchServer({ headless: true, timeout: 15_000 });
    browser = await chromium.connect(server.wsEndpoint(), { timeout: 10_000 });
    const context = await browser.newContext({ locale: "ko-KR", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36" });
    try {
      for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
        const requestedUrl = buildAlbamonListingUrl(pageNumber); const page = await context.newPage();
        try {
          await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
          await page.waitForFunction(() => Boolean(document.querySelector("a[href*='/jobs/detail/'], main")) || /로그인|본인.?확인|captcha|접근이 제한|검색 결과가 없습니다/i.test(document.body?.innerText?.slice(0, 5000) ?? ""), undefined, { timeout: READINESS_TIMEOUT_MS }).catch(() => undefined);
          await page.waitForTimeout(500);
          const raw = await page.evaluate(ALBAMON_LISTING_EVALUATOR_SOURCE) as unknown;
          const result = toAlbamonListingPageResult(raw, pageNumber, requestedUrl);
          let newIds = 0; for (const candidate of result.candidates) if (!seen.has(candidate.sourcePostingId)) { seen.add(candidate.sourcePostingId); newIds += 1; }
          result.uniqueNewPostingIdCount = newIds; results.push(result);
        } catch (error) {
          const currentUrl = page.url();
          const finalUrl = /^https:\/\/(?:www|m)\.albamon\.com\/jobs\/total(?:\?|$)/.test(currentUrl) ? currentUrl : null;
          results.push({ pageNumber, requestedUrl, finalUrl, classification: "transport_failed", extractedNumericLinkCount: 0,
            uniquePostingIdCount: 0, uniqueNewPostingIdCount: 0, sourceReportsNoResults: false, blocked: false, parserFailure: false,
            validEmptyPage: false, candidates: [], diagnosticCodes: [classifyAlbamonNavigationFailure(error)] });
        } finally { await page.close({ runBeforeUnload: false }).catch(() => undefined); }
      }
    } finally { await context.close().catch(() => undefined); }
  } finally { await browser?.close().catch(() => undefined); await server?.close().catch(() => undefined); }
  return results;
}
