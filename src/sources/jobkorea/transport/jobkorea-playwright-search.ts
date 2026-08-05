import type { Browser, BrowserContext, Page, Request } from "playwright";
import { chromium } from "playwright";
import type { ParseDiagnostic } from "../../../domain/source-contract";
import { JobKoreaTransportError } from "./jobkorea-error";
import { buildJobKoreaListingPageResult } from "./jobkorea-listing-page";
import { classifyJobKoreaResponse } from "./jobkorea-response-classifier";
import { jobKoreaSearchPageUrl, normalizeJobKoreaUrl } from "./jobkorea-url-policy";
import type { JobKoreaDirectContractObservation, JobKoreaDirectVerificationResult, JobKoreaListingPageResult, JobKoreaRenderedPageSnapshot, JobKoreaSearchExecution, JobKoreaSearchOptions } from "./jobkorea-search-types";

const PAGE_TIMEOUT_MS = 15_000;
const STABILITY_DELAY_MS = 500;
const DIRECT_PATH = "/Recruit/Home/_GI_List/";
const DIRECT_BODY_KEYS = new Set(["page", "condition[local]", "order", "pagesize", "tabindex"]);

async function closePage(page: Page): Promise<void> {
  try { await page.close({ runBeforeUnload: false }); } catch { /* browser.close remains the final cleanup boundary */ }
}

function diagnostic(code: string, message: string, severity: ParseDiagnostic["severity"] = "warning"): ParseDiagnostic {
  return { severity, code, field: null, message };
}

export function unavailableDirectVerification(code = "JOBKOREA_DIRECT_ENDPOINT_UNAVAILABLE", message = "현재 공개 검색 페이지에서 익명 _GI_List 계약을 확인하지 못했습니다."): JobKoreaDirectVerificationResult {
  return { classification: "direct_endpoint_unavailable", observation: null, diagnostic: diagnostic(code, message) };
}

export function verifyDirectObservation(observation: JobKoreaDirectContractObservation | null): JobKoreaDirectVerificationResult {
  if (!observation) return unavailableDirectVerification();
  if (observation.method !== "POST" || observation.hasCookieHeader || observation.hasAuthorizationHeader || observation.hasTokenField) {
    return { classification: "direct_endpoint_session_required", observation: null,
      diagnostic: diagnostic("JOBKOREA_DIRECT_ENDPOINT_SESSION_REQUIRED", "관찰된 _GI_List 요청에 cookie, 인증 또는 token 의존 가능성이 있어 직접 호출하지 않습니다.", "error") };
  }
  return { classification: "available", observation,
    diagnostic: diagnostic("JOBKOREA_DIRECT_ENDPOINT_ANONYMOUS_CONTRACT", "익명 공개 페이지에서 제한된 _GI_List form 계약을 관찰했습니다.", "info") };
}

function observeDirectRequest(request: Request): JobKoreaDirectContractObservation | null {
  const url = new URL(request.url());
  if (url.hostname !== "www.jobkorea.co.kr" || url.pathname !== DIRECT_PATH) return null;
  const headers = request.headers();
  const raw = request.postData() ?? "";
  const params = new URLSearchParams(raw);
  const body: Record<string, string> = {};
  for (const [key, value] of params) if (DIRECT_BODY_KEYS.has(key)) body[key] = value.slice(0, 200);
  const rawKeys = [...params.keys()];
  return {
    endpoint: `${url.origin}${url.pathname}`, method: request.method(), body,
    contentType: headers["content-type"] ?? null, ordinaryResultSelector: "tr.devloopArea[data-gno]",
    hasCookieHeader: Boolean(headers.cookie), hasAuthorizationHeader: Boolean(headers.authorization),
    hasTokenField: rawKeys.some((key) => /token|csrf|signature|authorization|session/i.test(key)),
  };
}

async function renderedSnapshot(page: Page, directObservation: JobKoreaDirectContractObservation | null): Promise<JobKoreaRenderedPageSnapshot> {
  return page.evaluate(({ direct }) => {
    const compact = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const selectors = ".list-default, .recruit-info, .recruit-list, .search-list, .list-post, [class*='recruit-list'], [class*='search-list']";
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/Recruit/GI_Read"]')].map((anchor) => {
      const row = anchor.closest<HTMLElement>("tr.devloopArea[data-gno]");
      const container = row ?? anchor.closest<HTMLElement>("li, article, [data-gno], .item, .post, .list-item");
      const contextualRoot = anchor.closest<HTMLElement>(selectors);
      const excludedRoot = anchor.closest<HTMLElement>("header, footer, aside, nav, [class*='recommend'], [class*='attention'], [class*='recent']");
      const containerText = compact((container ?? anchor.parentElement)?.textContent);
      const recommendationEvidence = Boolean(excludedRoot) || /지금\s*주목할\s*만한\s*공고|추천\s*공고|최근\s*본\s*공고/.test(containerText);
      const promotedEvidence = /(?:^|\s)AD(?:\s|$)|스폰서|sponsored/i.test(containerText)
        || Boolean((container ?? anchor).querySelector("[class*='ad'], [class*='sponsor']"));
      const ordinaryContainer = Boolean(row || contextualRoot || (anchor.closest("main") && container && !excludedRoot));
      const company = (container ?? anchor.parentElement)?.querySelector<HTMLElement>(".name, .company, [class*='company'], [class*='corp']");
      return { href: anchor.href, title: compact(anchor.textContent), companyName: compact(company?.textContent), containerText,
        dataGno: row?.dataset.gno ?? container?.dataset.gno ?? null, ordinaryContainer, promotedEvidence, recommendationEvidence };
    });
    const bodyText = compact(document.body?.innerText);
    return { finalUrl: location.href, title: document.title, bodyText: bodyText.slice(0, 100_000), anchors,
      sourceReportsNoResults: /검색\s*결과가\s*없|채용정보가\s*없|조건에\s*맞는\s*공고가\s*없/.test(bodyText), directObservation: direct };
  }, { direct: directObservation });
}

export function failedSearchPageResult(pageNumber: number, classification: "timeout" | "direct_endpoint_unavailable" | "direct_endpoint_session_required", code: string): JobKoreaListingPageResult {
  return { pageNumber, classification, extractedCount: 0, ordinaryPostingCount: 0, promotedPostingCount: 0, rejectedCandidateCount: 0,
    duplicateWithinPageCount: 0, uniqueNewCount: 0, sourceReportsNoResults: false, validEmptyPage: false,
    blocked: false, parserFailure: classification === "timeout", diagnostics: [diagnostic(code, `잡코리아 검색 페이지 분류: ${classification}`, "error")], candidates: [] };
}

export class JobKoreaPlaywrightSearchExecution implements JobKoreaSearchExecution {
  readonly transportUsed = "playwright" as const;
  readonly pages: JobKoreaListingPageResult[] = [];
  readonly consoleErrors: string[] = [];
  directVerification: JobKoreaDirectVerificationResult = unavailableDirectVerification();
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private detailNavigations = 0;

  get searchNavigationCount(): number { return this.pages.length; }
  get detailNavigationCount(): number { return this.detailNavigations; }
  get directRequestCount(): number { return 0; }

  constructor(private readonly options: JobKoreaSearchOptions) {}

  async start(): Promise<this> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ javaScriptEnabled: true, serviceWorkers: "block" });
    await this.context.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?)(?:\?|$)/i, (route) => route.abort());
    const globalSeen = new Set<string>();
    let observedDirect: JobKoreaDirectContractObservation | null = null;
    for (let pageNumber = 1; pageNumber <= this.options.pages; pageNumber += 1) {
      const page = await this.context.newPage();
      page.on("console", (message) => { if (message.type() === "error") this.consoleErrors.push(message.text().slice(0, 500)); });
      page.on("pageerror", (error) => this.consoleErrors.push(error.message.slice(0, 500)));
      page.on("request", (request) => { observedDirect ??= observeDirectRequest(request); });
      try {
        await page.goto(jobKoreaSearchPageUrl(this.options.searchUrl, pageNumber as 1 | 2), { waitUntil: "commit", timeout: PAGE_TIMEOUT_MS });
        await page.waitForFunction(() => {
          const text = document.body?.innerText ?? "";
          return Boolean(document.querySelector('a[href*="/Recruit/GI_Read"]'))
            || /검색\s*결과가\s*없|채용정보가\s*없|로그인|CAPTCHA|자동입력\s*방지|Access\s*Denied|접근이\s*차단/.test(text);
        }, undefined, { timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(STABILITY_DELAY_MS);
        const snapshot = await renderedSnapshot(page, observedDirect);
        const result = buildJobKoreaListingPageResult(snapshot, pageNumber, globalSeen);
        this.pages.push(result);
        if (result.blocked || result.parserFailure) break;
      } catch (error) {
        if (error instanceof Error && /Timeout/i.test(error.name + error.message)) this.pages.push(failedSearchPageResult(pageNumber, "timeout", "JOBKOREA_PLAYWRIGHT_TIMEOUT"));
        else throw new JobKoreaTransportError("JOBKOREA_PLAYWRIGHT_NAVIGATION_FAILED", "공개 검색 페이지 렌더링에 실패했습니다.", page.url() || this.options.searchUrl, { cause: error });
      } finally { await closePage(page); }
    }
    this.directVerification = verifyDirectObservation(observedDirect);
    return this;
  }

  async fetchDetail(candidate: string): Promise<{ finalUrl: string; html: string; explicitClosed: boolean }> {
    if (!this.context) throw new JobKoreaTransportError("JOBKOREA_PLAYWRIGHT_NOT_STARTED", "Playwright context가 준비되지 않았습니다.");
    if (this.detailNavigations >= this.options.maxDetails) throw new JobKoreaTransportError("JOBKOREA_DETAIL_BUDGET_EXCEEDED", "상세 navigation 한도를 초과했습니다.");
    this.detailNavigations += 1;
    const url = normalizeJobKoreaUrl(candidate, "detail");
    const page = await this.context.newPage();
    page.on("console", (message) => { if (message.type() === "error") this.consoleErrors.push(message.text().slice(0, 500)); });
    page.on("pageerror", (error) => this.consoleErrors.push(error.message.slice(0, 500)));
    try {
      const response = await page.goto(url, { waitUntil: "commit", timeout: PAGE_TIMEOUT_MS });
      await page.waitForFunction(() => /"@type"\s*:\s*"JobPosting"|마감되었습니다|로그인|CAPTCHA|Access\s*Denied/.test(document.documentElement.innerHTML), undefined, { timeout: PAGE_TIMEOUT_MS });
      await page.waitForTimeout(STABILITY_DELAY_MS);
      const html = await page.content();
      const finalUrl = page.url();
      classifyJobKoreaResponse({ finalUrl, status: response?.status() ?? 0, contentType: response?.headers()["content-type"] ?? "", body: html, redirectCount: 0 }, "detail");
      normalizeJobKoreaUrl(finalUrl, "detail");
      return { finalUrl, html, explicitClosed: /마감되었습니다|채용이\s*마감/.test(html) };
    } catch (error) {
      if (error instanceof JobKoreaTransportError) throw error;
      if (error instanceof Error && /Timeout/i.test(error.name + error.message)) throw new JobKoreaTransportError("JOBKOREA_PLAYWRIGHT_TIMEOUT", "상세 페이지 렌더링 시간이 초과됐습니다.", url, { cause: error });
      throw new JobKoreaTransportError("JOBKOREA_DETAIL_PROCESSING_FAILED", "브라우저 상세 처리에 실패했습니다.", url, { cause: error });
    } finally { await closePage(page); }
  }

  async close(): Promise<void> {
    // Closing the browser owns context/page teardown. Some public pages keep
    // long-lived requests that can make a separate context.close wait needlessly.
    await this.browser?.close({ reason: "bounded JobKorea one-shot completed" });
    this.context = null;
    this.browser = null;
  }
}
