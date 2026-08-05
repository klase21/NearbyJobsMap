import { existsSync, unlinkSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { migrateDatabase } from "./migrate";

export function validateResetTarget(target: string, allowedRoot = resolve(process.cwd(), "data")): string {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(allowedRoot);
  const relation = relative(resolvedRoot, resolvedTarget);
  if (!relation || relation.startsWith("..") || relation.includes(":") || ![".sqlite", ".db"].includes(extname(resolvedTarget).toLowerCase())) {
    throw new Error("안전한 data 디렉터리 안의 .sqlite 또는 .db 파일만 reset할 수 있습니다.");
  }
  return resolvedTarget;
}

export function resetDatabase(target: string, confirmed: boolean, options: { allowedRoot?: string; migrate?: boolean } = {}): string[] {
  if (!confirmed) throw new Error("reset에는 --confirm 플래그가 필요합니다.");
  const resolvedTarget = validateResetTarget(target, options.allowedRoot);
  const removed: string[] = [];
  for (const path of [resolvedTarget, `${resolvedTarget}-wal`, `${resolvedTarget}-shm`]) {
    if (existsSync(path)) { unlinkSync(path); removed.push(path); }
  }
  if (options.migrate) migrateDatabase(resolvedTarget);
  return removed;
}
