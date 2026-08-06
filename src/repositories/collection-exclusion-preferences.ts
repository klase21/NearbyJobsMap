import { normalizeCollectionExclusionConfig, type CollectionExclusionConfig } from "../services/collection-exclusion";

export const COLLECTION_EXCLUSION_STORAGE_KEY = "nearby-jobs-map:collection-exclusion:v1";

export function loadCollectionExclusionPreferences(storage: Pick<Storage, "getItem"> | null): CollectionExclusionConfig {
  if (!storage) return { keywords: [], fields: [] };
  try {
    const parsed: unknown = JSON.parse(storage.getItem(COLLECTION_EXCLUSION_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { keywords: [], fields: [] };
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !record.value || typeof record.value !== "object" || Array.isArray(record.value)) return { keywords: [], fields: [] };
    return normalizeCollectionExclusionConfig(record.value as Partial<CollectionExclusionConfig>);
  } catch { return { keywords: [], fields: [] }; }
}

export function saveCollectionExclusionPreferences(storage: Pick<Storage, "setItem"> | null, config: CollectionExclusionConfig): boolean {
  if (!storage) return false;
  try { storage.setItem(COLLECTION_EXCLUSION_STORAGE_KEY, JSON.stringify({ version: 1, value: normalizeCollectionExclusionConfig(config) })); return true; }
  catch { return false; }
}
