import type { ActiveJobSource } from "../domain/ui-job";

const SOURCE_HOSTS: Record<ActiveJobSource, ReadonlySet<string>> = {
  jobkorea: new Set(["www.jobkorea.co.kr", "m.jobkorea.co.kr"]),
  albamon: new Set(["www.albamon.com", "m.albamon.com"]),
};

export function getSafeSourceUrl(source: ActiveJobSource, candidate: string | null): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !SOURCE_HOSTS[source].has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}
