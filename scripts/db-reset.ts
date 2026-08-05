import { getDatabasePath } from "../src/db/connection";
import { resetDatabase } from "../src/db/reset";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const target = getDatabasePath();
    const removed = resetDatabase(target, process.argv.includes("--confirm"), { migrate: process.argv.includes("--migrate") });
    console.log(removed.length ? `removed=${removed.join(",")}` : "removed=none");
    if (!process.argv.includes("--migrate")) console.log("데이터베이스를 다시 준비하려면 npm run setup:local을 실행하세요.");
  } catch (error) {
    console.error(`database reset 거부: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
