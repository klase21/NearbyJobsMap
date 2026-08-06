import { ALBAMON_COLLECTION_PRESETS, type AlbamonCollectionPreset } from "../albamon/collection/albamon-collection-presets";
import { JOBKOREA_COLLECTION_PRESETS, type JobKoreaCollectionPreset } from "../jobkorea/collection/jobkorea-collection-presets";

export type CollectionPreset =
  | JobKoreaCollectionPreset
  | AlbamonCollectionPreset;

export const COLLECTION_PRESETS: Readonly<Record<string, CollectionPreset>> = Object.fromEntries([
  ...Object.values(JOBKOREA_COLLECTION_PRESETS).map((preset) => [preset.id, preset]),
  ...Object.values(ALBAMON_COLLECTION_PRESETS).map((preset) => [preset.id, preset]),
]);

export function getCollectionPreset(value: string): CollectionPreset | null {
  return COLLECTION_PRESETS[value] ?? null;
}
