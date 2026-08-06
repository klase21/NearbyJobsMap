import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";

const git = (...args: string[]) => {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
};

const tracked = git("ls-files");
const approvedScreenshots = new Set([
  "docs/images/jobs-list-map-desktop.png",
  "docs/images/collection-dashboard-desktop.png",
  "docs/images/collection-execution-desktop.png",
  "docs/images/profile-comparison-desktop.png",
  "docs/images/job-workspace-mobile.png",
  "docs/images/onboarding-mobile.png",
]);
const forbiddenFiles = tracked.filter((path) =>
  (path !== ".env.example" && /(^|\/)(?:\.env(?:\..+)?|cookies?\.json|session\.json)$/i.test(path))
  || /\.(?:sqlite3?|db|db-wal|db-shm|har|zip|log)$/i.test(path)
  || /(^|\/)(?:data\/(?:backups|exports|imports|tmp)|browser-profiles|storage-state|artifacts|screenshots)(\/|$)/i.test(path)
  || (/\.(?:png|jpe?g|webp)$/i.test(path) && !approvedScreenshots.has(path))
);

const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".ps1", ".sql", ".css", ".example", ""]);
const suspicious: string[] = [];
const patterns = [
  { label: "Windows user path", pattern: /C:\\Users\\[^\\\s]+/i },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "bearer credential", pattern: /Authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._~+/-]{16,}/i },
  { label: "database password", pattern: /PGPASSWORD\s*=\s*[^\s"']+/i },
];

for (const path of tracked) {
  if (path === "package-lock.json" || !textExtensions.has(extname(path).toLowerCase())) continue;
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { continue; }
  for (const { label, pattern } of patterns) if (pattern.test(text)) suspicious.push(`${path}: ${label}`);
}

const generated = git("status", "--porcelain=v1").map((line) => line.slice(3)).filter((path) =>
  path !== ".env.example" && /(?:\.sqlite3?|\.db(?:-wal|-shm)?|\.zip|\.har|\.log|\.env(?:\..+)?|profile-export\.json)$/i.test(path),
);

console.log(`bounded_release_audit tracked=${tracked.length}`);
console.log(`forbidden_tracked=${forbiddenFiles.length}`);
console.log(`suspicious_patterns=${suspicious.length}`);
console.log(`generated_workspace_artifacts=${generated.length}`);
for (const finding of [...forbiddenFiles, ...suspicious, ...generated]) console.error(`- ${finding}`);
console.log("note=This is a bounded project audit, not a complete secret scanner.");
if (forbiddenFiles.length || suspicious.length || generated.length) process.exitCode = 1;
