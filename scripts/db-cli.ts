import type { IngestionResult } from "../src/db/schema";

export function printIngestion(label: string, result: IngestionResult): void {
  console.log(`${label}: run=${result.runId}`);
  console.log(`inserted=${result.inserted} updated=${result.updated} unchanged=${result.unchanged} skipped=${result.skipped} failed=${result.failed}`);
  for (const diagnostic of result.diagnostics) console.log(`[${diagnostic.code}] ${diagnostic.source}:${diagnostic.sourcePostingId ?? "unknown"} ${diagnostic.message}`);
}
