import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCREENSHOT_SPECS, SCREENSHOT_WORK_RELATIVE } from "./screenshot-contracts";

const root = process.cwd();
const directory = resolve(root, "docs/images");
const approved = new Set(SCREENSHOT_SPECS.map(({ file }) => file));
const actual = existsSync(directory) ? readdirSync(directory).filter((file) => file !== ".gitkeep") : [];
const errors: string[] = [];
let total = 0;

for (const file of actual) if (!approved.has(file as never)) errors.push(`unapproved screenshot: docs/images/${file}`);
for (const spec of SCREENSHOT_SPECS) {
  const path = join(directory, spec.file);
  if (!existsSync(path)) { errors.push(`missing screenshot: docs/images/${spec.file}`); continue; }
  const bytes = readFileSync(path); const size = statSync(path).size; total += size;
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) errors.push(`${spec.file}: invalid PNG signature`);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (width !== spec.width || height !== spec.height) errors.push(`${spec.file}: expected ${spec.width}x${spec.height}, got ${width}x${height}`);
  if (size > 2 * 1024 * 1024) errors.push(`${spec.file}: exceeds 2 MiB`);
  const text = bytes.toString("latin1");
  if (/C:\\Users\\|NearbyJobsMap\\artifacts|screenshot-work/iu.test(text)) errors.push(`${spec.file}: local path metadata detected`);
}
if (total > 10 * 1024 * 1024) errors.push("total screenshot size exceeds 10 MiB");
if (existsSync(resolve(root, SCREENSHOT_WORK_RELATIVE))) errors.push("temporary screenshot workspace remains");

console.log(`screenshot_audit expected=${SCREENSHOT_SPECS.length} actual=${actual.length} bytes=${total}`);
for (const error of errors) console.error(`- ${error}`);
if (errors.length) process.exitCode = 1;
