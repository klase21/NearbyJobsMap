import type Database from "better-sqlite3";
import { JobRepository } from "../../../db/repositories/job-repository";
import { assessJobDataQuality, type AddressQuality, type SalaryQuality } from "../../../services/job-data-quality";

const ADDRESS_LEVELS: AddressQuality[] = ["full_address", "city_district", "region_only", "multiple_locations", "unknown", "contaminated"];
const SALARY_LEVELS: SalaryQuality[] = ["structured", "display_only", "negotiable", "unknown", "invalid"];

export interface JobKoreaQualityAudit {
  total: number;
  invalidNumericIds: number;
  canonicalIdMismatches: number;
  missingTitles: number;
  missingCompanies: number;
  contaminatedLocations: number;
  invalidCoordinatePairs: number;
  invalidSalaryRows: number;
  missingObservations: number;
  address: Record<AddressQuality, number>;
  salary: Record<SalaryQuality, number>;
  coordinateCoverage: number;
  commuteReady: number;
  employmentTypePresent: number;
  workDaysPresent: number;
  workHoursPresent: number;
  experiencePresent: number;
  educationPresent: number;
  listingOnly: number;
  detailComplete: number;
  completenessUnknown: number;
}

const emptyCounts = <T extends string>(values: readonly T[]): Record<T, number> => Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;

export function auditJobKoreaDataQuality(database: Database.Database): JobKoreaQualityAudit {
  const records = new JobRepository(database).listAllWithDiagnostics().records.filter(({ job }) => job.source === "jobkorea");
  const address = emptyCounts(ADDRESS_LEVELS); const salary = emptyCounts(SALARY_LEVELS);
  const result: JobKoreaQualityAudit = { total: records.length, invalidNumericIds: 0, canonicalIdMismatches: 0, missingTitles: 0,
    missingCompanies: 0, contaminatedLocations: 0, invalidCoordinatePairs: 0, invalidSalaryRows: 0, missingObservations: 0,
    address, salary, coordinateCoverage: 0, commuteReady: 0, employmentTypePresent: 0, workDaysPresent: 0, workHoursPresent: 0,
    experiencePresent: 0, educationPresent: 0, listingOnly: 0, detailComplete: 0, completenessUnknown: 0 };
  const observation = database.prepare("SELECT 1 FROM job_observations WHERE job_id = ? LIMIT 1");
  for (const { job, metadata } of records) {
    const publicIdentityRequired = metadata.recordKind !== "fictional_demo";
    if (publicIdentityRequired && !/^\d+$/.test(job.sourcePostingId)) result.invalidNumericIds += 1;
    const urlId = (job.canonicalUrl ?? job.sourceUrl).match(/\/GI_Read\/(\d+)/i)?.[1] ?? null;
    if (publicIdentityRequired && urlId !== job.sourcePostingId) result.canonicalIdMismatches += 1;
    if (!job.title.trim()) result.missingTitles += 1;
    if (!job.companyName.trim()) result.missingCompanies += 1;
    const quality = assessJobDataQuality(job); address[quality.addressQuality] += 1; salary[quality.salaryQuality] += 1;
    if (quality.addressQuality === "contaminated") result.contaminatedLocations += 1;
    if ((job.latitude === null) !== (job.longitude === null)) result.invalidCoordinatePairs += 1;
    if (quality.salaryQuality === "invalid") result.invalidSalaryRows += 1;
    if (!observation.get(job.id)) result.missingObservations += 1;
    if (job.latitude !== null && job.longitude !== null) result.coordinateCoverage += 1;
    if (quality.commuteReady) result.commuteReady += 1;
    if (job.employmentTypes.length) result.employmentTypePresent += 1;
    if (job.workDaysOriginalText) result.workDaysPresent += 1;
    if (job.workStartTime && job.workEndTime) result.workHoursPresent += 1;
    if (job.experienceRequirement) result.experiencePresent += 1;
    if (job.educationRequirement) result.educationPresent += 1;
    if (metadata.observationKind === "bounded_listing_collection") result.listingOnly += 1;
    else if (metadata.observationKind === "bounded_manual_collection") result.detailComplete += 1;
    else result.completenessUnknown += 1;
  }
  return result;
}

export function persistJobKoreaQualityMetadata(database: Database.Database): number {
  const records = new JobRepository(database).listAllWithDiagnostics().records.filter(({ job }) => job.source === "jobkorea");
  const update = database.prepare("UPDATE jobs SET address_quality = ?, salary_quality = ?, commute_ready = ? WHERE id = ?");
  let changed = 0;
  for (const { job, metadata } of records) {
    const quality = assessJobDataQuality(job);
    if (metadata.addressQuality !== quality.addressQuality || metadata.salaryQuality !== quality.salaryQuality || metadata.commuteReady !== quality.commuteReady) {
      changed += update.run(quality.addressQuality, quality.salaryQuality, quality.commuteReady ? 1 : 0, job.id).changes;
    }
  }
  return changed;
}

export function assertJobKoreaDatabaseIntegrity(database: Database.Database, selectedPostingIds: string[] = []): void {
  const failures: string[] = [];
  if (database.pragma("integrity_check", { simple: true }) !== "ok") failures.push("integrity_check");
  if ((database.pragma("foreign_key_check") as unknown[]).length) failures.push("foreign_key_check");
  const scalar = (sql: string): number => Number((database.prepare(sql).get() as { count: number }).count);
  if (scalar("SELECT COUNT(*) count FROM (SELECT source, source_posting_id FROM jobs GROUP BY source, source_posting_id HAVING COUNT(*) > 1)")) failures.push("duplicate_identity");
  if (scalar("SELECT COUNT(*) count FROM workplaces w LEFT JOIN jobs j ON j.id=w.job_id WHERE j.id IS NULL")) failures.push("orphan_workplace");
  if (scalar("SELECT COUNT(*) count FROM job_provenance_history p LEFT JOIN jobs j ON j.id=p.job_id WHERE j.id IS NULL")) failures.push("orphan_provenance");
  if (scalar("SELECT COUNT(*) count FROM job_observations o LEFT JOIN jobs j ON j.id=o.job_id WHERE j.id IS NULL")) failures.push("orphan_observation");
  if (selectedPostingIds.length) {
    const placeholders = selectedPostingIds.map(() => "?").join(",");
    const invalid = Number((database.prepare(`SELECT COUNT(*) count FROM jobs WHERE source='jobkorea' AND source_posting_id IN (${placeholders}) AND (
      source_posting_id NOT GLOB '[0-9]*' OR canonical_url NOT LIKE '%/Recruit/GI_Read/' || source_posting_id OR '%'
      OR trim(title)='' OR trim(company_name)='' OR address_quality='contaminated'
      OR (latitude IS NULL) != (longitude IS NULL) OR salary_quality='invalid'
      OR observation_kind NOT IN ('bounded_listing_collection','bounded_manual_collection'))`).get(...selectedPostingIds) as { count: number }).count);
    if (invalid) failures.push(`selected_invalid:${invalid}`);
    const missingProvenance = Number((database.prepare(`SELECT COUNT(*) count FROM jobs j WHERE j.source='jobkorea' AND j.source_posting_id IN (${placeholders})
      AND NOT EXISTS(SELECT 1 FROM job_provenance_history p WHERE p.job_id=j.id)`).get(...selectedPostingIds) as { count: number }).count);
    if (missingProvenance) failures.push(`selected_missing_provenance:${missingProvenance}`);
    const missingObservation = Number((database.prepare(`SELECT COUNT(*) count FROM jobs j WHERE j.source='jobkorea' AND j.source_posting_id IN (${placeholders})
      AND NOT EXISTS(SELECT 1 FROM job_observations o WHERE o.job_id=j.id)`).get(...selectedPostingIds) as { count: number }).count);
    if (missingObservation) failures.push(`selected_missing_observation:${missingObservation}`);
  }
  if (failures.length) throw new Error(`JOBKOREA_BACKFILL_INTEGRITY_FAILED:${failures.join(",")}`);
}
