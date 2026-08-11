import type { CanonicalJob } from "./canonical-job";
import type { LocationAccuracy } from "./location";
import type { PostingStatus } from "./posting-status";
import type { SalaryType } from "./salary";
import type { DataProvenanceKind } from "./data-provenance";
import type { NormalizedRegion, RegionEvidenceSource, RegionNormalizationConfidence } from "../services/region-normalizer";
import type { ExclusionField } from "../services/collection-exclusion";
import type { AddressQuality, SalaryQuality } from "../services/job-data-quality";

export type ActiveJobSource = "jobkorea" | "albamon";
export type RegionFilter = "all" | "seoul" | "gyeonggi" | "capital_scope" | "other" | "unknown";
export type ProvenanceFilter = "all" | "manual" | "fixture" | "demo";
export type CompletenessFilter = "all" | "listing_only" | "detail_complete";
export type UserJobStatus = "reviewing" | "saved" | "planned" | "applied" | "excluded";
export type SortOption = "newest" | "deadline" | "distance" | "monthly_distance" | "hourly" | "daily" | "monthly" | "annual" | "normalized_monthly" | "company";

export interface UserOrigin { name: string; latitude: number; longitude: number; example: boolean }
export interface MapPosition { latitude: number; longitude: number; kind: "exact" | "estimated"; provenance: "source" | "fictional_demo" }

export interface UiJobRecord {
  job: CanonicalJob;
  isFictional: boolean;
  safeSourceUrl: string | null;
  mapPosition: MapPosition | null;
  provenanceKind?: DataProvenanceKind;
  observedAt?: string | null;
  observationKind?: "bounded_public_browser_observation" | "bounded_manual_collection" | "bounded_listing_collection" | null;
  collectionPresetId?: string | null;
  collectionPresetLabel?: string | null;
  collectionKeyword?: string | null;
  normalizedRegions?: NormalizedRegion[];
  regionConfidence?: RegionNormalizationConfidence;
  regionEvidenceSource?: RegionEvidenceSource;
  sourceAreaCode?: string | null;
  addressQuality?: AddressQuality;
  salaryQuality?: SalaryQuality;
  commuteReady?: boolean;
  postingDateStatus?: import("../services/collection-date").PostingDateStatus;
  postingDateEvidence?: string | null;
  postingDateLocalDate?: string | null;
  firstSeenAt?: string | null;
}

export interface SalaryThresholds { hourly: number; daily: number; monthly: number; annual: number; normalizedMonthly: number }

export interface JobFilterState {
  keyword: string;
  source: "all" | ActiveJobSource;
  provenance: ProvenanceFilter;
  completeness: CompletenessFilter;
  region: RegionFilter;
  mapEligibility: "all" | "map" | "list_only";
  city: string;
  district: string;
  category: string;
  employmentType: string;
  experienceRequirement: string;
  educationRequirement: string;
  salaryType: "all" | SalaryType;
  salaryThresholds: SalaryThresholds;
  postingStatus: "all" | PostingStatus;
  locationAccuracy: "all" | LocationAccuracy;
  locationMode: "all" | "exact" | "estimated";
  deadline: "all" | "within_3_days" | "within_7_days" | "no_deadline";
  discoveryDate: "all" | "today_posted" | "today_first_seen";
  maxDistanceKm: number;
  showDemo: boolean;
  exclusionKeywords: string[];
  exclusionFields: ExclusionField[];
}

export interface SavedPreferences {
  filters: JobFilterState;
  sort: SortOption;
  mapVisible: boolean;
  origin: UserOrigin;
  userJobStatuses: Record<string, UserJobStatus>;
}
