import { resolve, sep } from "node:path";

export const SCREENSHOT_WORK_RELATIVE = "artifacts/screenshot-work";
export const SCREENSHOT_SPECS = [
  { file: "jobs-list-map-desktop.png", width: 1440, height: 1000 },
  { file: "collection-dashboard-desktop.png", width: 1440, height: 1100 },
  { file: "collection-execution-desktop.png", width: 1440, height: 1100 },
  { file: "profile-comparison-desktop.png", width: 1440, height: 1100 },
  { file: "job-workspace-mobile.png", width: 390, height: 844 },
  { file: "onboarding-mobile.png", width: 390, height: 844 },
] as const;

export const APPROVED_SCREENSHOT_FILES = SCREENSHOT_SPECS.map(({ file }) => `docs/images/${file}`);

export function assertIsolatedScreenshotDatabase(databasePath: string, projectRoot = process.cwd()): void {
  const workRoot = resolve(projectRoot, SCREENSHOT_WORK_RELATIVE);
  const resolved = resolve(databasePath);
  if (resolved === workRoot || !resolved.startsWith(`${workRoot}${sep}`)) throw new Error("Screenshot DB must stay inside artifacts/screenshot-work.");
  if (!/\.sqlite$/iu.test(resolved)) throw new Error("Screenshot DB must be a temporary SQLite file.");
}

export function isAllowedBrowserUrl(value: string, port: number): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && ["127.0.0.1", "localhost"].includes(url.hostname) && Number(url.port || (url.protocol === "https:" ? 443 : 80)) === port;
  } catch { return value.startsWith("data:") || value.startsWith("blob:"); }
}
