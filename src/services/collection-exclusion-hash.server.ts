import { createHash } from "node:crypto";
import { canonicalizeExclusionConfig, canonicalizeImportedExclusionConfig, type CollectionExclusionConfig } from "./collection-exclusion";

export function exclusionConfigurationHash(config: CollectionExclusionConfig, importedProfile = false): string {
  return createHash("sha256").update(importedProfile ? canonicalizeImportedExclusionConfig(config) : canonicalizeExclusionConfig(config)).digest("hex");
}
