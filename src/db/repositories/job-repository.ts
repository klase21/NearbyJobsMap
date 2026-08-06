import type Database from "better-sqlite3";
import type { CanonicalJob, CanonicalWorkplace } from "../../domain/canonical-job";
import type { CanonicalSalary } from "../../domain/salary";
import type { MapPosition, UiJobRecord } from "../../domain/ui-job";
import { getSafeSourceUrl } from "../../services/external-url";
import { calculateJobContentHash } from "../content-hash";
import { isLocationAccuracy, isPostingStatus, isSalaryType, validateCanonicalJob } from "../job-validation";
import type { IngestionMetadata, PersistedJobRecord, RepositoryListResult } from "../schema";
import type { CollectionRegion, NormalizedRegion, RegionNormalizationConfidence } from "../../services/region-normalizer";

type SqlRow = Record<string, unknown>;
export type UpsertAction = "inserted" | "updated" | "unchanged" | "skipped";
export interface UpsertResult { action: UpsertAction; jobId: string; contentHash: string }

export class JobRepositoryError extends Error {
  constructor(public readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JobRepositoryError";
  }
}

const JOB_COLUMNS = [
  "id", "source", "source_posting_id", "source_url", "canonical_url", "title", "company_name", "normalized_company_name",
  "description_summary", "experience_requirement", "education_requirement", "salary_original_text", "salary_type",
  "salary_minimum_amount", "salary_maximum_amount", "salary_currency", "salary_negotiable", "salary_includes_incentive",
  "salary_normalized_monthly_minimum", "salary_normalized_monthly_maximum", "salary_normalization_basis", "salary_normalization_confidence",
  "address_original_text", "road_address", "parcel_address", "city", "district", "neighborhood", "nearest_station", "latitude", "longitude",
  "location_accuracy", "workplace_count", "work_days_original_text", "work_start_time", "work_end_time", "shift_type", "posted_at", "modified_at",
  "expires_at", "posting_status", "promoted", "remote", "collected_at", "last_verified_at", "raw_payload_reference", "record_kind", "is_fictional",
  "evidence_type", "source_fixture_reference", "display_map_latitude", "display_map_longitude", "display_map_kind", "display_map_provenance",
  "provenance_kind", "permission_status", "provenance_evidence_type", "provenance_listing_url", "provenance_detail_url", "observed_at", "sanitizer_version", "parser_version",
  "observation_kind", "observation_transport", "observation_page_number", "observation_listing_position",
  "collection_preset_id", "collection_preset_label", "collection_keyword", "requested_regions_json", "normalized_regions_json",
  "region_normalization_confidence", "region_evidence_source", "source_area_code", "displayed_location_present", "detail_access_status", "observed_link_count",
  "content_hash", "created_at", "updated_at",
] as const;

const INSERT_JOB_SQL = `INSERT INTO jobs (${JOB_COLUMNS.join(", ")}) VALUES (${JOB_COLUMNS.map((column) => `@${column}`).join(", ")})`;
const UPDATE_COLUMNS = JOB_COLUMNS.filter((column) => !["id", "created_at"].includes(column));
const UPDATE_JOB_SQL = `UPDATE jobs SET ${UPDATE_COLUMNS.map((column) => `${column} = @${column}`).join(", ")} WHERE id = @persisted_id`;

const booleanToSql = (value: boolean | null): 0 | 1 | null => value === null ? null : value ? 1 : 0;
const legacyRecordKind = (value: IngestionMetadata["recordKind"]): "fixture_derived" | "fictional_demo" => value === "fictional_demo" ? "fictional_demo" : "fixture_derived";
const legacyEvidenceType = (value: IngestionMetadata["evidenceType"]): Exclude<IngestionMetadata["evidenceType"], "public_page_observation"> => value === "public_page_observation" ? "observed_html" : value;

function parameters(job: CanonicalJob, metadata: IngestionMetadata, contentHash: string, createdAt: string, updatedAt: string): SqlRow {
  return {
    id: job.id, source: job.source, source_posting_id: job.sourcePostingId, source_url: job.sourceUrl, canonical_url: job.canonicalUrl,
    title: job.title, company_name: job.companyName, normalized_company_name: job.normalizedCompanyName, description_summary: job.descriptionSummary,
    experience_requirement: job.experienceRequirement, education_requirement: job.educationRequirement,
    salary_original_text: job.salary.originalText, salary_type: job.salary.type, salary_minimum_amount: job.salary.minimumAmount,
    salary_maximum_amount: job.salary.maximumAmount, salary_currency: job.salary.currency, salary_negotiable: booleanToSql(job.salary.negotiable),
    salary_includes_incentive: booleanToSql(job.salary.includesIncentive), salary_normalized_monthly_minimum: job.salary.normalizedMonthlyMinimum,
    salary_normalized_monthly_maximum: job.salary.normalizedMonthlyMaximum, salary_normalization_basis: job.salary.normalizationBasis,
    salary_normalization_confidence: job.salary.normalizationConfidence, address_original_text: job.addressOriginalText, road_address: job.roadAddress,
    parcel_address: job.parcelAddress, city: job.city, district: job.district, neighborhood: job.neighborhood, nearest_station: job.nearestStation,
    latitude: job.latitude, longitude: job.longitude, location_accuracy: job.locationAccuracy, workplace_count: job.workplaceCount,
    work_days_original_text: job.workDaysOriginalText, work_start_time: job.workStartTime, work_end_time: job.workEndTime, shift_type: job.shiftType,
    posted_at: job.postedAt, modified_at: job.modifiedAt, expires_at: job.expiresAt, posting_status: job.postingStatus,
    promoted: booleanToSql(job.promoted), remote: booleanToSql(job.remote), collected_at: job.collectedAt, last_verified_at: job.lastVerifiedAt,
    raw_payload_reference: job.rawPayloadReference, record_kind: legacyRecordKind(metadata.recordKind), is_fictional: metadata.recordKind === "fictional_demo" ? 1 : 0,
    evidence_type: legacyEvidenceType(metadata.evidenceType), source_fixture_reference: metadata.sourceFixtureReference,
    display_map_latitude: metadata.mapPosition?.latitude ?? null, display_map_longitude: metadata.mapPosition?.longitude ?? null,
    display_map_kind: metadata.mapPosition?.kind ?? null, display_map_provenance: metadata.mapPosition?.provenance ?? null,
    provenance_kind: metadata.recordKind, permission_status: metadata.permissionStatus ?? null, provenance_evidence_type: metadata.evidenceType,
    provenance_listing_url: metadata.listingUrl ?? null, provenance_detail_url: metadata.detailUrl ?? null,
    observed_at: metadata.observedAt ?? null, sanitizer_version: metadata.sanitizerVersion ?? null, parser_version: metadata.parserVersion ?? null,
    observation_kind: metadata.observationKind ?? null, observation_transport: metadata.observationTransport ?? null,
    observation_page_number: metadata.pageNumber ?? null, observation_listing_position: metadata.listingPosition ?? null,
    collection_preset_id: metadata.collectionPresetId ?? null, collection_preset_label: metadata.collectionPresetLabel ?? null,
    collection_keyword: metadata.collectionKeyword ?? null, requested_regions_json: JSON.stringify(metadata.requestedRegions ?? []),
    normalized_regions_json: JSON.stringify(metadata.normalizedRegions ?? []), region_normalization_confidence: metadata.regionConfidence ?? "unknown",
    region_evidence_source: metadata.regionEvidenceSource ?? "unknown", source_area_code: metadata.sourceAreaCode ?? null,
    displayed_location_present: metadata.displayedLocationPresent === undefined || metadata.displayedLocationPresent === null ? null : booleanToSql(metadata.displayedLocationPresent),
    detail_access_status: metadata.detailAccessStatus ?? null, observed_link_count: metadata.observedLinkCount ?? null,
    content_hash: contentHash, created_at: createdAt, updated_at: updatedAt,
  };
}

function requiredString(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new JobRepositoryError("INVALID_DATABASE_ROW", `${key} 문자열이 필요합니다.`);
  return value;
}

function nullableString(row: SqlRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new JobRepositoryError("INVALID_DATABASE_ROW", `${key} 문자열 또는 null이 필요합니다.`);
  return value;
}

function nullableNumber(row: SqlRow, key: string): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new JobRepositoryError("INVALID_DATABASE_ROW", `${key} 숫자 또는 null이 필요합니다.`);
  return value;
}

function stringArray<T extends string>(row: SqlRow, key: string, allowed: ReadonlySet<string>): T[] {
  const value = requiredString(row, key);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !allowed.has(item))) throw new Error("invalid");
    return parsed as T[];
  } catch { throw new JobRepositoryError("INVALID_DATABASE_ROW", `${key} JSON 배열이 유효하지 않습니다.`); }
}

function sqlBoolean(row: SqlRow, key: string, nullable: true): boolean | null;
function sqlBoolean(row: SqlRow, key: string, nullable?: false): boolean;
function sqlBoolean(row: SqlRow, key: string, nullable = false): boolean | null {
  const value = row[key];
  if (nullable && value === null) return null;
  if (value !== 0 && value !== 1) throw new JobRepositoryError("INVALID_DATABASE_ROW", `${key} boolean 값이 유효하지 않습니다.`);
  return value === 1;
}

function readSalary(row: SqlRow): CanonicalSalary {
  const type = requiredString(row, "salary_type");
  if (!isSalaryType(type)) throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 salary_type: ${type}`);
  const currency = nullableString(row, "salary_currency");
  if (currency !== null && currency !== "KRW") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 salary_currency: ${currency}`);
  const confidence = nullableString(row, "salary_normalization_confidence");
  if (confidence !== null && confidence !== "high" && confidence !== "medium" && confidence !== "low") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 normalization confidence: ${confidence}`);
  return {
    originalText: requiredString(row, "salary_original_text"), type, minimumAmount: nullableNumber(row, "salary_minimum_amount"),
    maximumAmount: nullableNumber(row, "salary_maximum_amount"), currency, negotiable: sqlBoolean(row, "salary_negotiable"),
    includesIncentive: sqlBoolean(row, "salary_includes_incentive", true), normalizedMonthlyMinimum: nullableNumber(row, "salary_normalized_monthly_minimum"),
    normalizedMonthlyMaximum: nullableNumber(row, "salary_normalized_monthly_maximum"), normalizationBasis: nullableString(row, "salary_normalization_basis"),
    normalizationConfidence: confidence,
  };
}

function readWorkplace(row: SqlRow): CanonicalWorkplace {
  const accuracy = requiredString(row, "accuracy");
  if (!isLocationAccuracy(accuracy)) throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 workplace accuracy: ${accuracy}`);
  return {
    originalText: requiredString(row, "original_text"), roadAddress: nullableString(row, "road_address"), parcelAddress: nullableString(row, "parcel_address"),
    city: nullableString(row, "city"), district: nullableString(row, "district"), neighborhood: nullableString(row, "neighborhood"),
    nearestStation: nullableString(row, "nearest_station"), latitude: nullableNumber(row, "latitude"), longitude: nullableNumber(row, "longitude"),
    accuracy, isHeadquartersOnly: sqlBoolean(row, "is_headquarters_only"),
  };
}

export class JobRepository {
  constructor(private readonly database: Database.Database) {}

  private findIdentityRow(job: CanonicalJob): SqlRow | undefined {
    if (job.sourcePostingId.trim()) return this.database.prepare("SELECT * FROM jobs WHERE source = ? AND source_posting_id = ?").get(job.source, job.sourcePostingId) as SqlRow | undefined;
    return this.database.prepare("SELECT * FROM jobs WHERE source = ? AND source_posting_id = '' AND canonical_url = ?").get(job.source, job.canonicalUrl) as SqlRow | undefined;
  }

  private replaceChildren(jobId: string, job: CanonicalJob, now: string): void {
    this.database.prepare("DELETE FROM job_categories WHERE job_id = ?").run(jobId);
    this.database.prepare("DELETE FROM job_employment_types WHERE job_id = ?").run(jobId);
    this.database.prepare("DELETE FROM workplaces WHERE job_id = ?").run(jobId);
    const categoryStatement = this.database.prepare("INSERT INTO job_categories (job_id, category, position) VALUES (?, ?, ?)");
    job.categories.forEach((category, position) => categoryStatement.run(jobId, category, position));
    const employmentStatement = this.database.prepare("INSERT INTO job_employment_types (job_id, employment_type, position) VALUES (?, ?, ?)");
    job.employmentTypes.forEach((employmentType, position) => employmentStatement.run(jobId, employmentType, position));
    const workplaceStatement = this.database.prepare(`INSERT INTO workplaces
      (job_id, position, original_text, road_address, parcel_address, city, district, neighborhood, nearest_station, latitude, longitude, accuracy, is_headquarters_only, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    job.workplaces.forEach((workplace, position) => workplaceStatement.run(jobId, position, workplace.originalText, workplace.roadAddress, workplace.parcelAddress,
      workplace.city, workplace.district, workplace.neighborhood, workplace.nearestStation, workplace.latitude, workplace.longitude, workplace.accuracy,
      workplace.isHeadquartersOnly ? 1 : 0, now, now));
  }

  private recordProvenance(jobId: string, metadata: IngestionMetadata, now: string): void {
    this.database.prepare(`INSERT INTO job_provenance_history
      (job_id, provenance_kind, evidence_type, source_reference, permission_status, listing_url, detail_url, observed_at, sanitizer_version, parser_version,
       observation_kind, observation_transport, page_number, listing_position, collection_preset_id, collection_preset_label, collection_keyword,
        requested_regions_json, normalized_regions_json, region_normalization_confidence, region_evidence_source, source_area_code,
        displayed_location_present, detail_access_status, observed_link_count, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, provenance_kind, source_reference) DO UPDATE SET
        permission_status = excluded.permission_status, listing_url = excluded.listing_url, detail_url = excluded.detail_url,
        observed_at = excluded.observed_at, sanitizer_version = excluded.sanitizer_version, parser_version = excluded.parser_version,
        observation_kind = excluded.observation_kind, observation_transport = excluded.observation_transport,
        page_number = excluded.page_number, listing_position = excluded.listing_position,
        collection_preset_id = excluded.collection_preset_id, collection_preset_label = excluded.collection_preset_label,
        collection_keyword = excluded.collection_keyword, requested_regions_json = excluded.requested_regions_json,
        normalized_regions_json = excluded.normalized_regions_json, region_normalization_confidence = excluded.region_normalization_confidence,
        region_evidence_source = excluded.region_evidence_source, source_area_code = excluded.source_area_code,
        displayed_location_present = excluded.displayed_location_present,
        detail_access_status = excluded.detail_access_status, observed_link_count = excluded.observed_link_count,
        last_seen_at = excluded.last_seen_at`)
      .run(jobId, metadata.recordKind, metadata.evidenceType, metadata.sourceFixtureReference, metadata.permissionStatus ?? null,
        metadata.listingUrl ?? null, metadata.detailUrl ?? null, metadata.observedAt ?? null, metadata.sanitizerVersion ?? null,
        metadata.parserVersion ?? null, metadata.observationKind ?? null, metadata.observationTransport ?? null,
        metadata.pageNumber ?? null, metadata.listingPosition ?? null, metadata.collectionPresetId ?? null, metadata.collectionPresetLabel ?? null,
        metadata.collectionKeyword ?? null, JSON.stringify(metadata.requestedRegions ?? []), JSON.stringify(metadata.normalizedRegions ?? []),
        metadata.regionConfidence ?? "unknown", metadata.regionEvidenceSource ?? "unknown", metadata.sourceAreaCode ?? null,
        metadata.displayedLocationPresent === undefined || metadata.displayedLocationPresent === null ? null : booleanToSql(metadata.displayedLocationPresent),
        metadata.detailAccessStatus ?? null, metadata.observedLinkCount ?? null, now, now);
  }

  previewUpsert(job: CanonicalJob, metadata: IngestionMetadata): UpsertResult {
    const issues = validateCanonicalJob(job);
    if (issues.length) throw new JobRepositoryError("INGESTION_VALIDATION_FAILED", issues.map(({ code, message }) => `${code}: ${message}`).join(" "));
    const contentHash = calculateJobContentHash(job, metadata.mapPosition);
    const existing = this.findIdentityRow(job);
    if (!existing) return { action: "inserted", jobId: job.id, contentHash };
    if (nullableString(existing, "observation_kind") === "bounded_manual_collection" && metadata.observationKind === "bounded_listing_collection") {
      return { action: "skipped", jobId: requiredString(existing, "id"), contentHash: requiredString(existing, "content_hash") };
    }
    const existingKind = requiredString(existing, "provenance_kind");
    if (existingKind === "live_one_shot_observation" && metadata.recordKind === "fixture_derived") {
      return { action: "unchanged", jobId: requiredString(existing, "id"), contentHash: requiredString(existing, "content_hash") };
    }
    return { action: existing.content_hash === contentHash ? "unchanged" : "updated", jobId: requiredString(existing, "id"), contentHash };
  }

  upsert(job: CanonicalJob, metadata: IngestionMetadata): UpsertResult {
    const issues = validateCanonicalJob(job);
    if (issues.length) throw new JobRepositoryError("INGESTION_VALIDATION_FAILED", issues.map(({ code, message }) => `${code}: ${message}`).join(" "));
    const contentHash = calculateJobContentHash(job, metadata.mapPosition);
    const existing = this.findIdentityRow(job);
    const now = new Date().toISOString();
    const persistedId = existing ? requiredString(existing, "id") : job.id;
    const existingKind = existing ? requiredString(existing, "provenance_kind") : null;
    if (existing && nullableString(existing, "observation_kind") === "bounded_manual_collection" && metadata.observationKind === "bounded_listing_collection") {
      this.recordProvenance(persistedId, metadata, now);
      return { action: "skipped", jobId: persistedId, contentHash: requiredString(existing, "content_hash") };
    }
    if (existing && existingKind === "live_one_shot_observation" && metadata.recordKind === "fixture_derived") {
      this.recordProvenance(persistedId, metadata, now);
      return { action: "unchanged", jobId: persistedId, contentHash: requiredString(existing, "content_hash") };
    }
    try {
      this.database.transaction(() => {
        if (existing?.content_hash === contentHash) {
          this.recordProvenance(persistedId, metadata, now);
          this.database.prepare(`UPDATE jobs SET provenance_kind = ?, permission_status = ?, provenance_evidence_type = ?, provenance_listing_url = ?, provenance_detail_url = ?,
            observed_at = ?, sanitizer_version = ?, parser_version = ?, observation_kind = ?, observation_transport = ?, observation_page_number = ?,
            observation_listing_position = ?, collection_preset_id = ?, collection_preset_label = ?, collection_keyword = ?, requested_regions_json = ?,
            normalized_regions_json = ?, region_normalization_confidence = ?, region_evidence_source = ?, source_area_code = ?,
            displayed_location_present = ?, detail_access_status = ?, observed_link_count = ?,
            evidence_type = ?, source_fixture_reference = ?, last_verified_at = ? WHERE id = ?`)
            .run(metadata.recordKind, metadata.permissionStatus ?? null, metadata.evidenceType, metadata.listingUrl ?? null, metadata.detailUrl ?? null,
              metadata.observedAt ?? null, metadata.sanitizerVersion ?? null, metadata.parserVersion ?? null, metadata.observationKind ?? null,
              metadata.observationTransport ?? null, metadata.pageNumber ?? null, metadata.listingPosition ?? null,
              metadata.collectionPresetId ?? null, metadata.collectionPresetLabel ?? null, metadata.collectionKeyword ?? null,
              JSON.stringify(metadata.requestedRegions ?? []), JSON.stringify(metadata.normalizedRegions ?? []), metadata.regionConfidence ?? "unknown",
              metadata.regionEvidenceSource ?? "unknown", metadata.sourceAreaCode ?? null,
              metadata.displayedLocationPresent === undefined || metadata.displayedLocationPresent === null ? null : booleanToSql(metadata.displayedLocationPresent),
              metadata.detailAccessStatus ?? null, metadata.observedLinkCount ?? null, legacyEvidenceType(metadata.evidenceType),
              metadata.sourceFixtureReference, job.lastVerifiedAt, persistedId);
          return;
        }
        const values = parameters(job, metadata, contentHash, existing ? requiredString(existing, "created_at") : now, now);
        if (existing) this.database.prepare(UPDATE_JOB_SQL).run({ ...values, persisted_id: persistedId });
        else this.database.prepare(INSERT_JOB_SQL).run(values);
        this.replaceChildren(persistedId, job, now);
        this.recordProvenance(persistedId, metadata, now);
      })();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = /UNIQUE constraint failed/.test(message) ? "UNIQUE_IDENTITY_CONFLICT" : /workplaces|job_categories|job_employment_types/.test(message) ? "CHILD_COLLECTION_WRITE_FAILED" : "JOB_WRITE_FAILED";
      throw new JobRepositoryError(code, "canonical job 저장에 실패했습니다.", { cause: error });
    }
    return { action: existing ? existing.content_hash === contentHash ? "unchanged" : "updated" : "inserted", jobId: persistedId, contentHash };
  }

  private hydrateRow(row: SqlRow): PersistedJobRecord {
    const id = requiredString(row, "id");
    const source = requiredString(row, "source");
    if (source !== "jobkorea" && source !== "albamon" && source !== "work24") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 source: ${source}`);
    const locationAccuracy = requiredString(row, "location_accuracy");
    if (!isLocationAccuracy(locationAccuracy)) throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 location_accuracy: ${locationAccuracy}`);
    const postingStatus = requiredString(row, "posting_status");
    if (!isPostingStatus(postingStatus)) throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 posting_status: ${postingStatus}`);
    const categories = (this.database.prepare("SELECT category FROM job_categories WHERE job_id = ? ORDER BY position").all(id) as SqlRow[]).map((item) => requiredString(item, "category"));
    const employmentTypes = (this.database.prepare("SELECT employment_type FROM job_employment_types WHERE job_id = ? ORDER BY position").all(id) as SqlRow[]).map((item) => requiredString(item, "employment_type"));
    const workplaces = (this.database.prepare("SELECT * FROM workplaces WHERE job_id = ? ORDER BY position").all(id) as SqlRow[]).map(readWorkplace);
    const recordKind = requiredString(row, "provenance_kind");
    if (recordKind !== "fixture_derived" && recordKind !== "fictional_demo" && recordKind !== "live_one_shot_observation") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 provenance_kind: ${recordKind}`);
    const evidenceType = requiredString(row, "provenance_evidence_type");
    if (evidenceType !== "observed_html" && evidenceType !== "observed_json_ld" && evidenceType !== "observed_internal_json" && evidenceType !== "fictional_demo" && evidenceType !== "public_page_observation") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 evidence_type: ${evidenceType}`);
    const permissionStatus = nullableString(row, "permission_status");
    if (permissionStatus !== null && permissionStatus !== "unverified" && permissionStatus !== "blocked") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 permission_status: ${permissionStatus}`);
    const mapLatitude = nullableNumber(row, "display_map_latitude");
    const mapLongitude = nullableNumber(row, "display_map_longitude");
    const mapKind = nullableString(row, "display_map_kind");
    const mapProvenance = nullableString(row, "display_map_provenance");
    if (mapKind !== null && mapKind !== "exact" && mapKind !== "estimated") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 map kind: ${mapKind}`);
    if (mapProvenance !== null && mapProvenance !== "source" && mapProvenance !== "fictional_demo") throw new JobRepositoryError("INVALID_ENUM_ROW", `유효하지 않은 map provenance: ${mapProvenance}`);
    const mapPosition: MapPosition | null = mapLatitude !== null && mapLongitude !== null && mapKind !== null && mapProvenance !== null
      ? { latitude: mapLatitude, longitude: mapLongitude, kind: mapKind, provenance: mapProvenance }
      : null;
    const requestedRegions = stringArray<CollectionRegion>(row, "requested_regions_json", new Set(["seoul", "gyeonggi"]));
    const normalizedRegions = stringArray<NormalizedRegion>(row, "normalized_regions_json", new Set(["seoul", "gyeonggi", "incheon", "other"]));
    const regionConfidence = requiredString(row, "region_normalization_confidence") as RegionNormalizationConfidence;
    if (!["exact", "mapped_city", "multiple", "exact_source_filter", "unknown"].includes(regionConfidence)) throw new JobRepositoryError("INVALID_DATABASE_ROW", "region normalization confidence가 유효하지 않습니다.");
    const regionEvidenceSource = requiredString(row, "region_evidence_source") as NonNullable<IngestionMetadata["regionEvidenceSource"]>;
    if (!["displayed_location", "mapped_displayed_location", "source_filter", "unknown"].includes(regionEvidenceSource)) throw new JobRepositoryError("INVALID_DATABASE_ROW", "region evidence source가 유효하지 않습니다.");
    const detailAccessStatus = nullableString(row, "detail_access_status") as "available" | "access_blocked" | "unavailable" | "not_attempted" | null;
    if (detailAccessStatus !== null && !["available", "access_blocked", "unavailable", "not_attempted"].includes(detailAccessStatus)) throw new JobRepositoryError("INVALID_DATABASE_ROW", "detail access status가 유효하지 않습니다.");
    const job: CanonicalJob = {
      id, source, sourcePostingId: requiredString(row, "source_posting_id"), sourceUrl: requiredString(row, "source_url"), canonicalUrl: nullableString(row, "canonical_url"),
      title: requiredString(row, "title"), companyName: requiredString(row, "company_name"), normalizedCompanyName: nullableString(row, "normalized_company_name"),
      descriptionSummary: nullableString(row, "description_summary"), categories, employmentTypes, experienceRequirement: nullableString(row, "experience_requirement"),
      educationRequirement: nullableString(row, "education_requirement"), salary: readSalary(row), workDaysOriginalText: nullableString(row, "work_days_original_text"),
      workStartTime: nullableString(row, "work_start_time"), workEndTime: nullableString(row, "work_end_time"), shiftType: nullableString(row, "shift_type"),
      addressOriginalText: nullableString(row, "address_original_text"), roadAddress: nullableString(row, "road_address"), parcelAddress: nullableString(row, "parcel_address"),
      city: nullableString(row, "city"), district: nullableString(row, "district"), neighborhood: nullableString(row, "neighborhood"), nearestStation: nullableString(row, "nearest_station"),
      latitude: nullableNumber(row, "latitude"), longitude: nullableNumber(row, "longitude"), locationAccuracy, workplaces,
      workplaceCount: nullableNumber(row, "workplace_count"), postedAt: nullableString(row, "posted_at"), modifiedAt: nullableString(row, "modified_at"),
      expiresAt: nullableString(row, "expires_at"), postingStatus, promoted: sqlBoolean(row, "promoted", true), remote: sqlBoolean(row, "remote", true),
      collectedAt: requiredString(row, "collected_at"), lastVerifiedAt: requiredString(row, "last_verified_at"), rawPayloadReference: nullableString(row, "raw_payload_reference"),
    };
    const issues = validateCanonicalJob(job);
    if (issues.length) throw new JobRepositoryError("INVALID_DATABASE_ROW", issues.map(({ code }) => code).join(", "));
    return {
      job,
      metadata: { recordKind, evidenceType, sourceFixtureReference: requiredString(row, "source_fixture_reference"), mapPosition,
        permissionStatus,
        listingUrl: nullableString(row, "provenance_listing_url"), detailUrl: nullableString(row, "provenance_detail_url"),
        observedAt: nullableString(row, "observed_at"), sanitizerVersion: nullableString(row, "sanitizer_version"), parserVersion: nullableString(row, "parser_version"),
        observationKind: (nullableString(row, "observation_kind") as IngestionMetadata["observationKind"]) ?? null,
        observationTransport: (nullableString(row, "observation_transport") as IngestionMetadata["observationTransport"]) ?? null,
        pageNumber: nullableNumber(row, "observation_page_number"), listingPosition: nullableNumber(row, "observation_listing_position"),
        collectionPresetId: nullableString(row, "collection_preset_id"), collectionPresetLabel: nullableString(row, "collection_preset_label"),
        collectionKeyword: nullableString(row, "collection_keyword"), requestedRegions, normalizedRegions, regionConfidence,
        regionEvidenceSource, sourceAreaCode: nullableString(row, "source_area_code"),
        displayedLocationPresent: sqlBoolean(row, "displayed_location_present", true),
        detailAccessStatus, observedLinkCount: nullableNumber(row, "observed_link_count") },
      contentHash: requiredString(row, "content_hash"), createdAt: requiredString(row, "created_at"), updatedAt: requiredString(row, "updated_at"),
    };
  }

  listAllWithDiagnostics(): RepositoryListResult {
    const records: PersistedJobRecord[] = [];
    const diagnostics: RepositoryListResult["diagnostics"] = [];
    for (const row of this.database.prepare("SELECT * FROM jobs ORDER BY rowid").all() as SqlRow[]) {
      try { records.push(this.hydrateRow(row)); }
      catch (error) {
        diagnostics.push({ jobId: typeof row.id === "string" ? row.id : null, code: error instanceof JobRepositoryError ? error.code : "INVALID_DATABASE_ROW", message: error instanceof Error ? error.message : "DB row 검증 실패" });
      }
    }
    return { records, diagnostics };
  }

  listAll(): CanonicalJob[] { return this.listAllWithDiagnostics().records.map(({ job }) => job); }

  listUiRecords(): { records: UiJobRecord[]; diagnostics: RepositoryListResult["diagnostics"] } {
    const result = this.listAllWithDiagnostics();
    return {
      records: result.records.map(({ job, metadata }) => ({
        job, isFictional: metadata.recordKind === "fictional_demo",
        safeSourceUrl: metadata.recordKind === "fictional_demo" || job.source === "work24" ? null : getSafeSourceUrl(job.source, job.canonicalUrl ?? job.sourceUrl),
        mapPosition: metadata.mapPosition, provenanceKind: metadata.recordKind, observedAt: metadata.observedAt ?? null,
        observationKind: metadata.observationKind ?? null,
        collectionPresetId: metadata.collectionPresetId ?? null, collectionPresetLabel: metadata.collectionPresetLabel ?? null,
        collectionKeyword: metadata.collectionKeyword ?? null, normalizedRegions: metadata.normalizedRegions ?? [], regionConfidence: metadata.regionConfidence ?? "unknown",
        regionEvidenceSource: metadata.regionEvidenceSource ?? "unknown", sourceAreaCode: metadata.sourceAreaCode ?? null,
      })),
      diagnostics: result.diagnostics,
    };
  }

  findById(id: string): CanonicalJob | null {
    const row = this.database.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? this.hydrateRow(row).job : null;
  }

  findBySourceIdentity(source: CanonicalJob["source"], sourcePostingId: string): CanonicalJob | null {
    const row = this.database.prepare("SELECT * FROM jobs WHERE source = ? AND source_posting_id = ?").get(source, sourcePostingId) as SqlRow | undefined;
    return row ? this.hydrateRow(row).job : null;
  }

  countBySource(): Record<string, number> {
    return Object.fromEntries((this.database.prepare("SELECT source, COUNT(*) AS count FROM jobs GROUP BY source").all() as Array<{ source: string; count: number }>).map(({ source, count }) => [source, count]));
  }
}
