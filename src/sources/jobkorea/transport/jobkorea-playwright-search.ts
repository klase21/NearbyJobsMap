import type { Browser, BrowserContext, BrowserServer, Page, Request } from "playwright";
import { chromium } from "playwright";
import type { ParseDiagnostic } from "../../../domain/source-contract";
import { JobKoreaTransportError } from "./jobkorea-error";
import { JobKoreaLifecycleTimeoutError, runBoundedLifecyclePhase, type JobKoreaLifecycleDiagnostic } from "./jobkorea-lifecycle";
import { buildJobKoreaListingPageResult } from "./jobkorea-listing-page";
import { captureJobKoreaPageSnapshot, JobKoreaSnapshotError } from "./jobkorea-page-snapshot";
import { classifyJobKoreaResponse } from "./jobkorea-response-classifier";
import { jobKoreaSearchPageUrl, normalizeJobKoreaUrl } from "./jobkorea-url-policy";
import type { JobKoreaDirectContractObservation, JobKoreaDirectVerificationResult, JobKoreaListingPageResult, JobKoreaSearchExecution, JobKoreaSearchOptions } from "./jobkorea-search-types";

const BROWSER_LAUNCH_TIMEOUT_MS = 5_000;
const BROWSER_CONNECT_TIMEOUT_MS = 1_500;
const CONTEXT_TIMEOUT_MS = 1_500;
const PAGE_OPEN_TIMEOUT_MS = 1_000;
const NAVIGATION_TIMEOUT_MS = 7_000;
const READINESS_TIMEOUT_MS = 4_000;
const SNAPSHOT_TIMEOUT_MS = 1_000;
const PAGE_CLOSE_TIMEOUT_MS = 750;
const BROWSER_CLOSE_TIMEOUT_MS = 750;
const BROWSER_KILL_TIMEOUT_MS = 1_000;
const STABILITY_DELAY_MS = 400;
const DIRECT_PATH = "/Recruit/Home/_GI_List/";
const DIRECT_BODY_KEYS = new Set(["page", "condition[local]", "order", "pagesize", "tabindex"]);

async function closePage(page: Page, diagnostics: JobKoreaLifecycleDiagnostic[], phase: string): Promise<void> {
  try {
    await runBoundedLifecyclePhase(phase, PAGE_CLOSE_TIMEOUT_MS, () => page.close({ runBeforeUnload: false }), diagnostics);
  } catch {
    // BrowserServer.kill is the final cleanup boundary.
  }
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

export function failedSearchPageResult(pageNumber: number, classification: "timeout" | "unexpected_page" | "direct_endpoint_unavailable" | "direct_endpoint_session_required", code: string): JobKoreaListingPageResult {
  return { pageNumber, snapshotSchemaVersion: null, finalUrl: null, pageTitle: null, classification, extractedCount: null, ordinaryPostingCount: null, promotedPostingCount: null, rejectedCandidateCount: null,
    duplicateWithinPageCount: null, uniqueNewCount: null, sourceReportsNoResults: null, validEmptyPage: false,
    blocked: false, parserFailure: classification === "timeout" || classification === "unexpected_page", diagnostics: [diagnostic(code, `잡코리아 검색 페이지 분류: ${classification}`, "error")], candidates: [] };
}

export class JobKoreaPlaywrightSearchExecution implements JobKoreaSearchExecution {
  readonly transportUsed = "playwright" as const;
  readonly pages: JobKoreaListingPageResult[] = [];
  readonly consoleErrors: string[] = [];
  readonly lifecycleDiagnostics: JobKoreaLifecycleDiagnostic[] = [];
  directVerification: JobKoreaDirectVerificationResult = unavailableDirectVerification();
  private server: BrowserServer | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private detailNavigations = 0;

  get searchNavigationCount(): number { return this.pages.length; }
  get detailNavigationCount(): number { return this.detailNavigations; }
  get directRequestCount(): number { return 0; }

  constructor(private readonly options: JobKoreaSearchOptions) {}

  async start(): Promise<this> {
    const globalSeen = new Set<string>();
    let observedDirect: JobKoreaDirectContractObservation | null = null;
    try {
      this.server = await runBoundedLifecyclePhase("browser-launch", BROWSER_LAUNCH_TIMEOUT_MS + 500,
        () => chromium.launchServer({ headless: true, timeout: BROWSER_LAUNCH_TIMEOUT_MS }), this.lifecycleDiagnostics);
      this.browser = await runBoundedLifecyclePhase("browser-connect", BROWSER_CONNECT_TIMEOUT_MS + 250,
        () => chromium.connect(this.server!.wsEndpoint(), { timeout: BROWSER_CONNECT_TIMEOUT_MS }), this.lifecycleDiagnostics);
      this.context = await runBoundedLifecyclePhase("browser-context", CONTEXT_TIMEOUT_MS,
        () => this.browser!.newContext({ javaScriptEnabled: true, serviceWorkers: "block" }), this.lifecycleDiagnostics);
      await this.context.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?)(?:\?|$)/i, (route) => route.abort());
    } catch (error) {
      const timeout = error instanceof JobKoreaLifecycleTimeoutError;
      this.pages.push(failedSearchPageResult(1, timeout ? "timeout" : "unexpected_page",
        timeout ? "JOBKOREA_PLAYWRIGHT_LIFECYCLE_TIMEOUT" : "JOBKOREA_PLAYWRIGHT_START_FAILED"));
      this.consoleErrors.push(error instanceof Error ? error.message.slice(0, 500) : "Playwright 시작 실패");
      return this;
    }

    for (let pageNumber = 1; pageNumber <= this.options.pages; pageNumber += 1) {
      let page: Page | null = null;
      try {
        page = await runBoundedLifecyclePhase(`page-${pageNumber}-open`, PAGE_OPEN_TIMEOUT_MS,
          () => this.context!.newPage(), this.lifecycleDiagnostics);
        page.on("console", (message) => { if (message.type() === "error") this.consoleErrors.push(message.text().slice(0, 500)); });
        page.on("pageerror", (error) => this.consoleErrors.push(error.message.slice(0, 500)));
        page.on("request", (request) => { observedDirect ??= observeDirectRequest(request); });
        await runBoundedLifecyclePhase(`page-${pageNumber}-navigation`, NAVIGATION_TIMEOUT_MS + 250,
          () => page!.goto(jobKoreaSearchPageUrl(this.options.searchUrl, pageNumber as 1 | 2), { waitUntil: "commit", timeout: NAVIGATION_TIMEOUT_MS }).then(() => undefined),
          this.lifecycleDiagnostics);
        await runBoundedLifecyclePhase(`page-${pageNumber}-readiness`, READINESS_TIMEOUT_MS + 250, () => page!.waitForFunction(() => {
          const text = document.body?.innerText ?? "";
          return Boolean(document.querySelector('a[href*="/Recruit/GI_Read"]'))
            || /검색\s*결과가\s*없|채용정보가\s*없|로그인|CAPTCHA|자동입력\s*방지|Access\s*Denied|접근이\s*차단/.test(text);
        }, undefined, { timeout: READINESS_TIMEOUT_MS }).then(() => undefined), this.lifecycleDiagnostics);
        await page.waitForTimeout(STABILITY_DELAY_MS);
        const snapshot = await runBoundedLifecyclePhase(`page-${pageNumber}-snapshot`, SNAPSHOT_TIMEOUT_MS,
          () => captureJobKoreaPageSnapshot(page!), this.lifecycleDiagnostics);
        const result = buildJobKoreaListingPageResult(snapshot, pageNumber, globalSeen);
        this.pages.push(result);
        if (result.blocked || result.parserFailure) break;
      } catch (error) {
        const timeout = error instanceof JobKoreaLifecycleTimeoutError || (error instanceof Error && /Timeout/i.test(error.name + error.message));
        const snapshotCode = error instanceof JobKoreaSnapshotError ? error.code : null;
        this.pages.push(failedSearchPageResult(pageNumber, timeout ? "timeout" : "unexpected_page",
          timeout ? "JOBKOREA_PLAYWRIGHT_TIMEOUT" : snapshotCode ?? "JOBKOREA_PLAYWRIGHT_NAVIGATION_FAILED"));
        if (!timeout) this.consoleErrors.push(error instanceof Error ? error.message.slice(0, 500) : "검색 페이지 처리 실패");
      } finally {
        if (page) await closePage(page, this.lifecycleDiagnostics, `page-${pageNumber}-close`);
      }
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
      const response = await page.goto(url, { waitUntil: "commit", timeout: NAVIGATION_TIMEOUT_MS });
      await page.waitForFunction(() => /"@type"\s*:\s*"JobPosting"|마감되었습니다|로그인|CAPTCHA|Access\s*Denied/.test(document.documentElement.innerHTML), undefined, { timeout: READINESS_TIMEOUT_MS });
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
    } finally { await closePage(page, this.lifecycleDiagnostics, "detail-page-close"); }
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await runBoundedLifecyclePhase("browser-close", BROWSER_CLOSE_TIMEOUT_MS,
          () => this.browser!.close({ reason: "bounded JobKorea one-shot completed" }), this.lifecycleDiagnostics);
      } catch { /* BrowserServer.kill below is authoritative. */ }
    }
    if (this.server && this.server.process().exitCode === null) {
      try {
        await runBoundedLifecyclePhase("browser-kill", BROWSER_KILL_TIMEOUT_MS,
          () => this.server!.kill(), this.lifecycleDiagnostics);
      } catch { /* The internal deadline still returns the structured result. */ }
    }
    this.context = null;
    this.browser = null;
    this.server = null;
  }
}
