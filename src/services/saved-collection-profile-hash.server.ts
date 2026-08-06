import "server-only";
import { createHash } from "node:crypto";
import { canonicalProfileConfiguration, type SavedCollectionProfileInput } from "./saved-collection-profile";

export function savedProfileConfigurationHash(input: Omit<SavedCollectionProfileInput, "name" | "isFavorite">): string {
  return createHash("sha256").update(canonicalProfileConfiguration(input), "utf8").digest("hex");
}
