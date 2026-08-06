import { chromium, type Browser, type BrowserContext, type BrowserServer, type Page, type Request, type Response } from "playwright";
import { ALBAMON_LISTING_EVALUATOR_SOURCE, toAlbamonListingPageResult } from "./albamon-listing-evaluator";
import { buildAlbamonListingUrl, normalizeAlbamonListingUrl } from "./albamon-url-policy";
import type { AlbamonListingPageResult, AlbamonTransportDiagnostic } from "./albamon-collection-types";
import { resolveAlbamonSingleRegionFilter } from "./albamon-region-evidence";
import type { CollectionRegion } from "../../../services/region-normalizer";

const NAVIGATION_TIMEOUT_MS = 15_000;
const READINESS_TIMEOUT_MS = 10_000;
const MAX_SCROLL_ITERATIONS = 15;

export function classifyAlbamonNavigationFailure(error: unknown): string {
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/ERR_(?:NAME_NOT_RESOLVED|DNS)/i.test(value)) return "ALBAMON_LISTING_DNS_FAILED";
  if (/ERR_CERT|CERTIFICATE|SSL|TLS/i.test(value)) return "ALBAMON_LISTING_TLS_FAILED";
  if (/TimeoutError|TIMED_OUT|timeout/i.test(value)) return "ALBAMON_LISTING_NAVIGATION_TIMEOUT";
  return "ALBAMON_LISTING_NAVIGATION_FAILED";
}

export function sanitizeAlbamonTransportError(error: unknown): { name: string; message: string } {
  const name = error instanceof Error && error.name ? error.name.slice(0, 80) : "Error";
  const raw = error instanceof Error ? error.message : String(error);
  return { name, message: raw.replace(/[\r\n]+/g, " ").replace(/file:\/\/\/[^ ]+/gi, "<LOCAL_PATH>")
    .replace(/[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*/g, "<LOCAL_PATH>").trim().slice(0, 300) };
}

function sanitizedHop(value: string, status: number | null): { host: string; path: string; status: number | null } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.albamon.com", "m.albamon.com"].includes(url.hostname.toLowerCase())) return null;
    return { host: url.hostname.toLowerCase(), path: url.pathname, status };
  } catch { return null; }
}

async function redirectChain(response: Response | null): Promise<Array<{ host: string; path: string; status: number | null }>> {
  if (!response) return [];
  const requests: Request[] = []; let request: Request | null = response.request();
  while (request) { requests.unshift(request); request = request.redirectedFrom(); }
  const hops = await Promise.all(requests.map(async (item) => sanitizedHop(item.url(), (await item.response())?.status() ?? null)));
  return hops.filter((hop): hop is NonNullable<typeof hop> => Boolean(hop));
}

function validateRedirects(response: Response | null): void {
  if (!response) return;
  let request: Request | null = response.request();
  while (request) { normalizeAlbamonListingUrl(request.url()); request = request.redirectedFrom(); }
}

function evaluatedCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const count = (value as { numericLinkCount?: unknown }).numericLinkCount;
  return Number.isInteger(count) && Number(count) >= 0 ? Number(count) : 0;
}

function evaluatedConclusive(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const state = value as { login?: unknown; verification?: unknown; captcha?: unknown; accessDenied?: unknown; noResults?: unknown };
  return [state.login, state.verification, state.captcha, state.accessDenied, state.noResults].some(Boolean);
}

export async function settleAlbamonListingPage(page: Pick<Page, "evaluate" | "waitForTimeout">): Promise<unknown> {
  const started = performance.now(); let priorCount = -1; let stableChecks = 0; let latest: unknown = null;
  await page.waitForTimeout(500);
  for (let iteration = 0; iteration <= MAX_SCROLL_ITERATIONS; iteration += 1) {
    latest = await page.evaluate(ALBAMON_LISTING_EVALUATOR_SOURCE) as unknown;
    const count = evaluatedCount(latest);
    if (evaluatedConclusive(latest) || count >= 50) return latest;
    stableChecks = count === priorCount ? stableChecks + 1 : 0; priorCount = count;
    if (count > 0 && stableChecks >= 2) return latest;
    if (iteration === MAX_SCROLL_ITERATIONS || performance.now() - started >= READINESS_TIMEOUT_MS) return latest;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(350);
  }
  return latest;
}

function diagnosticFor(requestedUrl: string): AlbamonTransportDiagnostic {
  return { requestedUrl, finalUrl: null, httpStatus: null, redirectChain: [], navigationElapsedMs: null,
    browserLaunchStatus: "failed", contextCreationStatus: "not_attempted", pageCreationStatus: "not_attempted",
    errorName: null, errorMessage: null, failureCategory: null, dnsFailure: false, tlsFailure: false, timeoutFailure: false,
    pageCrash: false, pageCleanup: "not_attempted", contextCleanup: "not_attempted", browserCleanup: "not_attempted", serverCleanup: "not_attempted" };
}

function failedPage(pageNumber: number, requestedUrl: string, error: unknown, diagnostic: AlbamonTransportDiagnostic): AlbamonListingPageResult {
  const failureCategory = classifyAlbamonNavigationFailure(error); const sanitized = sanitizeAlbamonTransportError(error);
  diagnostic.failureCategory = failureCategory; diagnostic.errorName = sanitized.name; diagnostic.errorMessage = sanitized.message;
  diagnostic.dnsFailure = failureCategory === "ALBAMON_LISTING_DNS_FAILED";
  diagnostic.tlsFailure = failureCategory === "ALBAMON_LISTING_TLS_FAILED";
  diagnostic.timeoutFailure = failureCategory === "ALBAMON_LISTING_NAVIGATION_TIMEOUT";
  return { pageNumber, requestedUrl, finalUrl: diagnostic.finalUrl, classification: "transport_failed", extractedNumericLinkCount: 0,
    uniquePostingIdCount: 0, uniqueNewPostingIdCount: 0, sourceReportsNoResults: false, blocked: false, parserFailure: false,
    validEmptyPage: false, invalidCardCount: 0, candidates: [], diagnosticCodes: [failureCategory], transportDiagnostic: diagnostic };
}

async function closeWithStatus(close: () => Promise<unknown>): Promise<"completed" | "failed"> {
  try { await close(); return "completed"; } catch { return "failed"; }
}

export async function collectAlbamonListingPages(pages: 1 | 2 | 3 | 4 | 5, options: { diagnostic?: boolean; sourceFilterRegion?: CollectionRegion | null } = {}): Promise<AlbamonListingPageResult[]> {
  const sourceFilter = resolveAlbamonSingleRegionFilter(options.sourceFilterRegion ? [options.sourceFilterRegion] : []);
  const listingUrl = (pageNumber: number) => buildAlbamonListingUrl(pageNumber, sourceFilter?.areaCode ?? null);
  let server: BrowserServer | null = null; let browser: Browser | null = null; let context: BrowserContext | null = null;
  const results: AlbamonListingPageResult[] = []; const seen = new Set<string>(); const diagnostics: AlbamonTransportDiagnostic[] = [];
  try {
    try {
      server = await chromium.launchServer({ headless: true, timeout: 15_000 });
      browser = await chromium.connect(server.wsEndpoint(), { timeout: 10_000 });
    } catch (error) {
      for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
        const requestedUrl = listingUrl(pageNumber); const diagnostic = diagnosticFor(requestedUrl); diagnostics.push(diagnostic);
        results.push(failedPage(pageNumber, requestedUrl, error, diagnostic));
      }
      return results;
    }
    for (const diagnostic of diagnostics) diagnostic.browserLaunchStatus = "completed";
    try {
      context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 1000 } });
    } catch (error) {
      for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
        const requestedUrl = listingUrl(pageNumber); const diagnostic = diagnosticFor(requestedUrl);
        diagnostic.browserLaunchStatus = "completed"; diagnostic.contextCreationStatus = "failed"; diagnostics.push(diagnostic);
        results.push(failedPage(pageNumber, requestedUrl, error, diagnostic));
      }
      return results;
    }
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const requestedUrl = listingUrl(pageNumber); const diagnostic = diagnosticFor(requestedUrl);
      diagnostic.browserLaunchStatus = "completed"; diagnostic.contextCreationStatus = "completed"; diagnostics.push(diagnostic);
      let page: Page | null = null; const navigationStarted = performance.now();
      try {
        page = await context.newPage(); diagnostic.pageCreationStatus = "completed";
        page.on("crash", () => { diagnostic.pageCrash = true; });
        const response = await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
        diagnostic.navigationElapsedMs = Math.round(performance.now() - navigationStarted);
        diagnostic.httpStatus = response?.status() ?? null; diagnostic.redirectChain = await redirectChain(response);
        validateRedirects(response); diagnostic.finalUrl = normalizeAlbamonListingUrl(page.url());
        const raw = await settleAlbamonListingPage(page);
        const result = toAlbamonListingPageResult(raw, pageNumber, requestedUrl);
        result.sourceFilterRegion = sourceFilter?.region ?? null;
        result.sourceAreaCode = sourceFilter?.areaCode ?? null;
        result.transportDiagnostic = diagnostic;
        let newIds = 0; for (const candidate of result.candidates) if (!seen.has(candidate.sourcePostingId)) { seen.add(candidate.sourcePostingId); newIds += 1; }
        result.uniqueNewPostingIdCount = newIds; results.push(result);
      } catch (error) {
        diagnostic.navigationElapsedMs = Math.round(performance.now() - navigationStarted);
        diagnostic.pageCreationStatus = page ? "completed" : "failed";
        const currentUrl = page?.url() ?? "";
        diagnostic.finalUrl = /^https:\/\/(?:www|m)\.albamon\.com\/jobs\/total(?:\?|$)/.test(currentUrl) ? currentUrl : null;
        results.push(failedPage(pageNumber, requestedUrl, error, diagnostic));
      } finally {
        diagnostic.pageCleanup = page ? await closeWithStatus(() => page!.close({ runBeforeUnload: false })) : "not_attempted";
      }
    }
  } finally {
    const contextCleanup = context ? await closeWithStatus(() => context!.close()) : "not_attempted";
    const browserCleanup = browser ? await closeWithStatus(() => browser!.close()) : "not_attempted";
    const serverCleanup = server ? await closeWithStatus(() => server!.close()) : "not_attempted";
    for (const diagnostic of diagnostics) {
      diagnostic.contextCleanup = contextCleanup; diagnostic.browserCleanup = browserCleanup; diagnostic.serverCleanup = serverCleanup;
    }
  }
  return results;
}
