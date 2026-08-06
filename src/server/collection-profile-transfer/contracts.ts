import type { ExclusionField } from "../../services/collection-exclusion";
import type { SavedCollectionProfile, SavedCollectionProfileInput, SavedProfileSource, SavedProfileStrategy } from "../../services/saved-collection-profile";

export const PROFILE_EXPORT_FORMAT = "nearby-jobs-collection-profiles" as const;
export const PROFILE_EXPORT_VERSION = 1 as const;
export const PROFILE_IMPORT_MAX_BYTES = 512 * 1024;
export const PROFILE_TRANSFER_MAX_PROFILES = 100;

export interface ExportedCollectionProfile {
  exportKey: string;
  name: string;
  source: SavedProfileSource;
  basePresetId: string;
  strategy: SavedProfileStrategy;
  keyword: string | null;
  regions: Array<"seoul" | "gyeonggi">;
  pages: number;
  maxCandidates: number;
  allowListingFallback: boolean;
  exclusionKeywords: string[];
  exclusionFields: ExclusionField[];
  isFavorite: boolean;
  sourceRevision: number;
  sourceConfigurationHash: string;
}

export interface CollectionProfileExportFile {
  format: typeof PROFILE_EXPORT_FORMAT;
  version: typeof PROFILE_EXPORT_VERSION;
  exportedAt: string;
  application: "NearbyJobsMap";
  profiles: ExportedCollectionProfile[];
}

export type ImportPreviewState = "valid_new" | "identical_existing" | "name_conflict_different_configuration" | "same_configuration_different_name" | "invalid" | "unsupported_source" | "unsupported_preset";
export type ImportAction = "create" | "skip" | "rename_and_create" | "replace_existing";

export interface ImportValidationError { code: string; message: string }
export interface ImportPreviewProfile {
  importIndex: number;
  exportKey: string;
  importedName: string;
  normalizedName: string | null;
  source: string | null;
  basePresetId: string | null;
  configurationValid: boolean;
  validationErrors: ImportValidationError[];
  computedConfigurationHash: string | null;
  exportedHashMatches: boolean | null;
  state: ImportPreviewState;
  conflictingProfile: Pick<SavedCollectionProfile, "id" | "name" | "revision" | "configurationHash" | "source" | "basePresetId" | "strategy"> | null;
  availableActions: ImportAction[];
  suggestedAction: ImportAction | null;
  configuration: SavedCollectionProfileInput | null;
}

export interface ImportPreviewResult {
  previewToken: string;
  expiresAt: string;
  format: typeof PROFILE_EXPORT_FORMAT;
  version: typeof PROFILE_EXPORT_VERSION;
  filename: string;
  fileSize: number;
  profileCount: number;
  profiles: ImportPreviewProfile[];
}

export interface ImportConfirmAction {
  exportKey: string;
  action: ImportAction;
  newName?: string;
  expectedRevision?: number;
  replaceConfirmed?: boolean;
}

export interface ImportConfirmResult {
  created: number;
  replaced: number;
  unchanged: number;
  skipped: number;
  invalidNotSelected: number;
  totalSelected: number;
  profiles: SavedCollectionProfile[];
}
