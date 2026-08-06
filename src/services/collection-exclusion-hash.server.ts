import { createHash } from "node:crypto";
import { canonicalizeExclusionConfig, type CollectionExclusionConfig } from "./collection-exclusion";

export function exclusionConfigurationHash(config: CollectionExclusionConfig): string {
  return createHash("sha256").update(canonicalizeExclusionConfig(config)).digest("hex");
}
