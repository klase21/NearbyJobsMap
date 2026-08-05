import { JobKoreaDirectSearchClient } from "./jobkorea-direct-search";
import { failedSearchPageResult, JobKoreaPlaywrightSearchExecution } from "./jobkorea-playwright-search";
import type { JobKoreaSearchExecution, JobKoreaSearchOptions } from "./jobkorea-search-types";

export interface JobKoreaSearchExecutionDependencies {
  createPlaywright?: (options: JobKoreaSearchOptions) => Promise<JobKoreaSearchExecution>;
  directClient?: JobKoreaDirectSearchClient;
}

export async function createJobKoreaSearchExecution(options: JobKoreaSearchOptions, dependencies: JobKoreaSearchExecutionDependencies = {}): Promise<JobKoreaSearchExecution> {
  const createPlaywright = dependencies.createPlaywright ?? (async (input) => new JobKoreaPlaywrightSearchExecution(input).start());
  const browser = await createPlaywright(options);
  if (options.transport !== "direct") return browser;
  const verification = browser.directVerification;
  if (verification.classification !== "available" || !verification.observation) {
    return {
      transportUsed: "direct", pages: [failedSearchPageResult(1,
        verification.classification === "direct_endpoint_session_required" ? "direct_endpoint_session_required" : "direct_endpoint_unavailable",
        verification.diagnostic.code)],
      consoleErrors: browser.consoleErrors, directVerification: verification,
      lifecycleDiagnostics: browser.lifecycleDiagnostics,
      searchNavigationCount: browser.searchNavigationCount, detailNavigationCount: browser.detailNavigationCount, directRequestCount: 0,
      close: () => browser.close(), fetchDetail: (url) => browser.fetchDetail(url),
    };
  }
  const directClient = dependencies.directClient ?? new JobKoreaDirectSearchClient();
  const pageResult = await directClient.request(verification.observation);
  return {
    transportUsed: "direct", pages: [pageResult], consoleErrors: browser.consoleErrors, directVerification: verification,
    lifecycleDiagnostics: browser.lifecycleDiagnostics,
    searchNavigationCount: browser.searchNavigationCount, get detailNavigationCount() { return browser.detailNavigationCount; },
    directRequestCount: directClient.requestCount, close: () => browser.close(), fetchDetail: (url) => browser.fetchDetail(url),
  };
}
