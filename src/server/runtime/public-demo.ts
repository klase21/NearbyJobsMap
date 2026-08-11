import "server-only";

import { tmpdir } from "node:os";
import { join } from "node:path";

export function isVercelPublicDemo(environment: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return Boolean(environment.VERCEL) && environment.NEARBY_JOBS_REAL_USE_MODE !== "1";
}

export function getPublicDemoDatabasePath(
  environment: Partial<NodeJS.ProcessEnv> = process.env,
  temporaryDirectory = tmpdir(),
  processId = process.pid,
): string {
  if (!isVercelPublicDemo(environment)) throw new Error("PUBLIC_DEMO_RUNTIME_REQUIRED");
  return join(temporaryDirectory, `nearby-jobs-map-demo-v1-${processId}.sqlite`);
}
