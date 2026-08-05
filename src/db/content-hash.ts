import { createHash } from "node:crypto";
import type { CanonicalJob } from "../domain/canonical-job";
import type { MapPosition } from "../domain/ui-job";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]));
  }
  return value === undefined ? null : value;
}

export function getMeaningfulJobContent(job: CanonicalJob, mapPosition: MapPosition | null = null): unknown {
  const meaningful: Record<string, unknown> = { ...job };
  delete meaningful.collectedAt;
  delete meaningful.lastVerifiedAt;
  delete meaningful.rawPayloadReference;
  return stableValue({ ...meaningful, displayMapPosition: mapPosition });
}

export function calculateJobContentHash(job: CanonicalJob, mapPosition: MapPosition | null = null): string {
  return createHash("sha256").update(JSON.stringify(getMeaningfulJobContent(job, mapPosition))).digest("hex");
}
