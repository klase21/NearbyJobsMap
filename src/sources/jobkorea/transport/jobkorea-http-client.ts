import { JobKoreaTransportError } from "./jobkorea-error";
import { JobKoreaRequestBudget } from "./jobkorea-request-budget";
import { normalizeJobKoreaUrl, validateJobKoreaRedirect } from "./jobkorea-url-policy";
import type { JobKoreaFetch, JobKoreaHttpResponse, JobKoreaPageKind } from "./types";

export const JOBKOREA_USER_AGENT = "NearbyJobsMap/0.1 one-shot local research prototype";
export const JOBKOREA_DEFAULT_TIMEOUT_MS = 12_000;
export const JOBKOREA_HARD_TIMEOUT_MS = 15_000;
export const JOBKOREA_DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const JOBKOREA_HARD_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const JOBKOREA_REDIRECT_LIMIT = 3;

function boundedEnvironmentNumber(value: string | undefined, fallback: number, hardMaximum: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1_000 ? Math.min(parsed, hardMaximum) : fallback;
}

export interface JobKoreaHttpClientConfig { timeoutMs: number; maxResponseBytes: number }

export function getJobKoreaHttpClientConfig(environment: NodeJS.ProcessEnv = process.env): JobKoreaHttpClientConfig {
  return {
    timeoutMs: boundedEnvironmentNumber(environment.JOBKOREA_TRANSPORT_TIMEOUT_MS, JOBKOREA_DEFAULT_TIMEOUT_MS, JOBKOREA_HARD_TIMEOUT_MS),
    maxResponseBytes: boundedEnvironmentNumber(environment.JOBKOREA_TRANSPORT_MAX_RESPONSE_BYTES, JOBKOREA_DEFAULT_MAX_RESPONSE_BYTES, JOBKOREA_HARD_MAX_RESPONSE_BYTES),
  };
}

async function readBoundedBody(response: Response, maximum: number, url: string): Promise<string> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > maximum) throw new JobKoreaTransportError("JOBKOREA_RESPONSE_TOO_LARGE", "응답 크기가 허용 한도를 초과했습니다.", url);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new JobKoreaTransportError("JOBKOREA_RESPONSE_TOO_LARGE", "응답 읽기 중 허용 크기를 초과했습니다.", url);
      }
      output += decoder.decode(chunk.value, { stream: true });
    }
    return output + decoder.decode();
  } finally { reader.releaseLock(); }
}

export class JobKoreaHttpClient {
  constructor(private readonly fetchImplementation: JobKoreaFetch = fetch, private readonly config = getJobKoreaHttpClientConfig()) {}

  async request(candidate: string, kind: JobKoreaPageKind, budget: JobKoreaRequestBudget): Promise<JobKoreaHttpResponse> {
    if (kind !== "robots") budget.startPage(kind);
    let current = normalizeJobKoreaUrl(candidate, kind);
    let redirects = 0;
    while (true) {
      budget.consumeHttp(kind);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetchImplementation(current, { method: "GET", redirect: "manual", signal: controller.signal,
          headers: { accept: kind === "robots" ? "text/plain" : "text/html,application/xhtml+xml", "user-agent": JOBKOREA_USER_AGENT } });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new JobKoreaTransportError("JOBKOREA_REDIRECT_REJECTED", "Location 없는 리다이렉트를 거부했습니다.", current);
          if (kind === "robots" || redirects >= JOBKOREA_REDIRECT_LIMIT) throw new JobKoreaTransportError("JOBKOREA_REDIRECT_REJECTED", "리다이렉트 한도를 초과했거나 robots 리다이렉트가 발생했습니다.", current);
          const resolved = new URL(location, current);
          if (/\/(?:login|member\/login|verification|captcha)/i.test(resolved.pathname)) throw new JobKoreaTransportError("JOBKOREA_LOGIN_REDIRECT", "로그인 또는 확인 페이지 리다이렉트를 거부했습니다.", current);
          current = validateJobKoreaRedirect(current, location, kind);
          redirects += 1;
          continue;
        }
        const body = await readBoundedBody(response, kind === "robots" ? Math.min(this.config.maxResponseBytes, 512 * 1024) : this.config.maxResponseBytes, current);
        return { finalUrl: current, status: response.status, contentType: response.headers.get("content-type") ?? "", body, redirectCount: redirects };
      } catch (error) {
        if (error instanceof JobKoreaTransportError) throw error;
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw new JobKoreaTransportError("JOBKOREA_TRANSPORT_TIMEOUT", "잡코리아 요청 시간이 초과됐습니다.", current, { cause: error });
        }
        throw new JobKoreaTransportError("JOBKOREA_NETWORK_ERROR", "잡코리아 공개 페이지 요청에 실패했습니다.", current, { cause: error });
      } finally { clearTimeout(timer); }
    }
  }
}
