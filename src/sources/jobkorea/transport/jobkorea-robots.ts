import { JobKoreaHttpClient } from "./jobkorea-http-client";
import { JobKoreaRequestBudget } from "./jobkorea-request-budget";

export interface JobKoreaRobotsResult { permissionStatus: "unverified" | "blocked"; blocked: boolean; diagnosticCode: string; message: string }

function robotsAllows(body: string, pathname: string): boolean | null {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) current.rules.push({ allow: key === "allow", path: value });
  }
  const applicable = groups.filter(({ agents }) => agents.some((agent) => agent === "*" || "nearbyjobsmap".startsWith(agent)));
  const matches = applicable.flatMap(({ rules }) => rules).filter(({ path }) => path && pathname.startsWith(path));
  if (!matches.length) return applicable.length ? true : null;
  matches.sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));
  return matches[0]!.allow;
}

export async function preflightJobKoreaRobots(client: JobKoreaHttpClient, budget: JobKoreaRequestBudget, listingUrl: string): Promise<JobKoreaRobotsResult> {
  const url = new URL(listingUrl);
  try {
    const response = await client.request(`${url.origin}/robots.txt`, "robots", budget);
    if (response.status < 200 || response.status >= 300 || !/^(?:text\/plain|text\/html)\b/i.test(response.contentType)) {
      return { permissionStatus: "unverified", blocked: false, diagnosticCode: "JOBKOREA_ROBOTS_UNCLEAR", message: "robots.txt 상태를 명확히 확인하지 못했습니다. --confirm에 따라 권한 미확인 상태로 계속합니다." };
    }
    const allowed = robotsAllows(response.body, url.pathname);
    if (allowed === false) return { permissionStatus: "blocked", blocked: true, diagnosticCode: "JOBKOREA_ROBOTS_DISALLOWED", message: "robots.txt가 요청한 목록 경로를 기술적으로 허용하지 않아 콘텐츠 요청을 하지 않습니다." };
    return { permissionStatus: "unverified", blocked: false, diagnosticCode: allowed ? "JOBKOREA_PERMISSION_UNVERIFIED" : "JOBKOREA_ROBOTS_UNCLEAR",
      message: "robots.txt는 법적 허가를 의미하지 않습니다. 공개 페이지 이용·재사용 권한은 미확인입니다." };
  } catch {
    return { permissionStatus: "unverified", blocked: false, diagnosticCode: "JOBKOREA_ROBOTS_PREFLIGHT_FAILED", message: "robots.txt 사전확인에 실패했습니다. --confirm에 따라 권한 미확인 상태로 계속합니다." };
  }
}
