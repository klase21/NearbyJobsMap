import "server-only";
import { randomUUID } from "node:crypto";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";
import { PROFILE_EXPORT_FORMAT, PROFILE_EXPORT_VERSION, type CollectionProfileExportFile, type ExportedCollectionProfile } from "./contracts";

function exported(profile: SavedCollectionProfile): ExportedCollectionProfile {
  return { exportKey: randomUUID(), name: profile.name, source: profile.source, basePresetId: profile.basePresetId, strategy: profile.strategy,
    keyword: profile.keyword, regions: [...profile.regions], pages: profile.pages, maxCandidates: profile.maxCandidates,
    allowListingFallback: profile.allowListingFallback, exclusionKeywords: [...profile.exclusion.keywords], exclusionFields: [...profile.exclusion.fields],
    isFavorite: profile.isFavorite, sourceRevision: profile.revision, sourceConfigurationHash: profile.configurationHash };
}

export function serializeProfiles(profiles: SavedCollectionProfile[], now = new Date()): { file: CollectionProfileExportFile; json: string } {
  const file: CollectionProfileExportFile = { format: PROFILE_EXPORT_FORMAT, version: PROFILE_EXPORT_VERSION, exportedAt: now.toISOString(), application: "NearbyJobsMap", profiles: profiles.map(exported) };
  return { file, json: `${JSON.stringify(file, null, 2)}\n` };
}

export function safeExportFilename(profiles: SavedCollectionProfile[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/gu, "").slice(0, 15).replace("T", "-");
  if (profiles.length !== 1) return `nearby-jobs-profiles-${stamp}.json`;
  const filtered = [...profiles[0]!.name.normalize("NFKC")].map((character) => { const code=character.codePointAt(0)??0; return code<32||code===127||"\\/:*?\"<>|".includes(character)?"-":character; }).join("");
  const safe = filtered.replace(/\s+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "").slice(0, 60) || "profile";
  return `nearby-jobs-profile-${safe}-${stamp.slice(0, 8)}.json`;
}
