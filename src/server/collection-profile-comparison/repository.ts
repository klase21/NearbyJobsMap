import "server-only";
import type Database from "better-sqlite3";
import { EXCLUSION_FIELDS } from "../../services/collection-exclusion";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";
import { SavedCollectionProfileRepository } from "../collection-profiles/repository";
import type { ProfileComparisonRequest, ProfileConfigurationDifference, ProfileExclusionComparison, ProfileOverlapComparison, ProfilePairOverlap, ProfilePerformanceComparison, SavedProfileComparisonResult } from "./contracts";

type Row = Record<string, unknown>;
const SUCCESS_RESULTS = new Set(["inserted", "updated", "unchanged", "skipped"]);
const n = (value: unknown) => Number(value ?? 0);
const optionalNumber = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const optionalString = (value: unknown): string | null => typeof value === "string" && value ? value : null;
const rate = (numerator: number | null, denominator: number | null): number | null => denominator && numerator !== null ? Math.round(numerator / denominator * 1000) / 10 : null;

export class SavedProfileComparisonRepository {
  constructor(private readonly database: Database.Database, private readonly now: () => Date = () => new Date()) {}

  compare(request: ProfileComparisonRequest): SavedProfileComparisonResult {
    const repository = new SavedCollectionProfileRepository(this.database);
    const byId = new Map(repository.list().map((profile) => [profile.id, profile]));
    const profiles = request.profileIds.map((id) => byId.get(id));
    if (profiles.some((profile) => !profile)) throw Object.assign(new Error("선택한 저장 프로필을 찾을 수 없습니다."), { code: "PROFILE_COMPARISON_PROFILE_NOT_FOUND", status: 404 });
    const selected = profiles as SavedCollectionProfile[];
    const placeholders = selected.map(() => "?").join(",");
    const cutoff = request.period === "all" ? null : new Date(this.now().getTime() - (request.period === "7d" ? 7 : 30) * 86_400_000).toISOString();
    const runRows = this.database.prepare(`SELECT * FROM ingestion_runs WHERE dry_run=0 AND saved_profile_id IN (${placeholders})${cutoff ? " AND started_at>=?" : ""} ORDER BY started_at DESC`).all(...selected.map((profile) => profile.id), ...(cutoff ? [cutoff] : [])) as Row[];
    const filteredRuns = runRows.filter((run) => {
      if (request.revisionScope === "all") return true;
      const profile = byId.get(String(run.saved_profile_id));
      return Boolean(profile && run.saved_profile_revision !== null && Number(run.saved_profile_revision) === profile.revision && typeof run.saved_profile_configuration_hash === "string" && run.saved_profile_configuration_hash === profile.configurationHash);
    });
    const runIds = filteredRuns.map((run) => String(run.id));
    const itemRows = runIds.length ? this.database.prepare(`SELECT ingestion_run_id,source,source_posting_id,result,diagnostic_codes FROM ingestion_items WHERE ingestion_run_id IN (${runIds.map(() => "?").join(",")})`).all(...runIds) as Row[] : [];
    const itemsByRun = new Map<string, Row[]>();
    for (const item of itemRows) { const id = String(item.ingestion_run_id); const values = itemsByRun.get(id) ?? []; values.push(item); itemsByRun.set(id, values); }
    const runsByProfile = new Map(selected.map((profile) => [profile.id, filteredRuns.filter((run) => run.saved_profile_id === profile.id)]));
    const identitySets = new Map(selected.map((profile) => [profile.id, observedIdentities(runsByProfile.get(profile.id) ?? [], itemsByRun)]));
    const differences = configurationDifferences(selected);
    return {
      generatedAt: this.now().toISOString(), period: request.period, revisionScope: request.revisionScope, profiles: selected,
      configurationDifferences: differences, differenceSummary: differenceSummary(selected, differences), exclusions: exclusionComparison(selected),
      performance: selected.map((profile) => performance(profile, runsByProfile.get(profile.id) ?? [], itemsByRun)),
      overlap: overlapComparison(selected, identitySets), legacyLimitations: legacyLimitations(runRows, request.revisionScope),
    };
  }
}

function configurationDifferences(profiles: SavedCollectionProfile[]): ProfileConfigurationDifference[] {
  const fields: Array<[string, string, (profile: SavedCollectionProfile) => string]> = [
    ["source", "소스", (p) => p.source], ["basePresetId", "기본 프리셋", (p) => p.basePresetId], ["strategy", "전략", (p) => p.strategy],
    ["keyword", "키워드", (p) => p.keyword ?? "해당 없음"], ["regions", "지역", (p) => p.regions.join(",")], ["pages", "페이지", (p) => String(p.pages)],
    ["maxCandidates", "최대 후보", (p) => String(p.maxCandidates)], ["allowListingFallback", "목록 대체", (p) => p.allowListingFallback ? "사용" : "사용 안 함"],
    ["exclusionKeywords", "제외 키워드", (p) => p.exclusion.keywords.join(" · ") || "없음"], ["exclusionFields", "제외 필드", (p) => p.exclusion.fields.join(",") || "없음"],
  ];
  return fields.map(([field, label, get]) => { const values = profiles.map((profile) => ({ profileId: profile.id, value: get(profile) })); return { field, label, same: new Set(values.map((value) => value.value)).size === 1, values }; });
}

function differenceSummary(profiles: SavedCollectionProfile[], differences: ProfileConfigurationDifference[]): string[] {
  const result: string[] = [];
  if (new Set(profiles.map((profile) => profile.source)).size === 1) result.push(`공통 소스: ${profiles[0]!.source === "jobkorea" ? "잡코리아" : "알바몬"}`);
  else result.push("서로 다른 소스이므로 정확한 공고 중복 비교가 제한됩니다.");
  if (!differences.find((item) => item.field === "regions")?.same) result.push("지역이 다릅니다.");
  const candidates = profiles.map((profile) => profile.maxCandidates); const candidateGap = Math.max(...candidates) - Math.min(...candidates);
  if (candidateGap) result.push(`최대 후보 수가 ${candidateGap}건 차이 납니다.`);
  const common = exclusionComparison(profiles).commonKeywords.length; if (common) result.push(`공통 제외 키워드 ${common}개`);
  if (!differences.find((item) => item.field === "exclusionKeywords")?.same) result.push("프로필별 고유 제외 키워드가 있습니다.");
  if (!differences.find((item) => item.field === "strategy")?.same) result.push("수집 전략이 다릅니다.");
  return result;
}

function exclusionComparison(profiles: SavedCollectionProfile[]): ProfileExclusionComparison {
  const allKeywordSets = profiles.map((profile) => new Set(profile.exclusion.keywords));
  const commonAll = profiles[0]!.exclusion.keywords.filter((keyword) => allKeywordSets.every((set) => set.has(keyword)));
  const allFieldSets = profiles.map((profile) => new Set(profile.exclusion.fields));
  const commonFields = EXCLUSION_FIELDS.filter((field) => allFieldSets.every((set) => set.has(field)));
  return { commonKeywords: commonAll.slice(0, 20), commonKeywordsTruncated: commonAll.length > 20,
    uniqueKeywords: profiles.map((profile) => { const unique = profile.exclusion.keywords.filter((keyword) => profiles.filter((other) => other.id !== profile.id).every((other) => !other.exclusion.keywords.includes(keyword))); return { profileId: profile.id, keywords: unique.slice(0, 20), truncated: unique.length > 20 }; }),
    commonFields, uniqueFields: profiles.map((profile) => ({ profileId: profile.id, fields: profile.exclusion.fields.filter((field) => !commonFields.includes(field)) })),
    profilesWithoutExclusions: profiles.filter((profile) => !profile.exclusion.keywords.length).map((profile) => profile.id) };
}

function performance(profile: SavedCollectionProfile, runs: Row[], itemsByRun: Map<string, Row[]>): ProfilePerformanceComparison {
  const items = runs.flatMap((run) => itemsByRun.get(String(run.id)) ?? []); const failedItems = items.filter((item) => item.result === "failed").length;
  const knownExclusions = runs.every((run) => run.exclusion_config_hash !== null); const selected = sumKnown(runs, (run) => knownExclusions ? optionalNumber(run.selected_candidate_count_after_exclusion) : optionalNumber(run.selected_detail_count));
  const excluded = knownExclusions ? sumKnown(runs, (run) => optionalNumber(run.excluded_candidate_count)) : null;
  const before = selected !== null && excluded !== null ? selected + excluded : null;
  const classified = items.filter((item) => item.result !== "failed");
  const outcomeKnown = classified.every((item) => item.source === "albamon" || codes(item).some((code) => code.includes("LISTING_FALLBACK") || code.includes("DETAIL_COMPLETE")));
  const detailSuccesses = outcomeKnown ? classified.filter((item) => codes(item).some((code) => code.includes("DETAIL_COMPLETE"))).length : null;
  const fallbacks = outcomeKnown ? classified.filter((item) => item.source === "albamon" || codes(item).some((code) => code.includes("LISTING_FALLBACK"))).length : null;
  const durations = runs.map((run) => duration(run)).filter((value): value is number => value !== null); const totalDuration = durations.length === runs.length && runs.length ? durations.reduce((a, b) => a + b, 0) : null;
  const inserted = runs.reduce((sum, run) => sum + n(run.inserted_count), 0); const updated = runs.reduce((sum, run) => sum + n(run.updated_count), 0); const unchanged = runs.reduce((sum, run) => sum + n(run.unchanged_count), 0); const skipped = runs.reduce((sum, run) => sum + n(run.skipped_count), 0);
  const revisionCounts = new Map<number, number>(); for (const run of runs) if (run.saved_profile_revision !== null) revisionCounts.set(Number(run.saved_profile_revision), (revisionCounts.get(Number(run.saved_profile_revision)) ?? 0) + 1);
  const hashes = new Set(runs.map((run) => optionalString(run.saved_profile_configuration_hash)).filter(Boolean)); const latest = runs[0];
  return { profileId: profile.id, writeRuns: runs.length, completedRuns: runs.filter((run) => ["completed", "partial"].includes(String(run.status))).length, failedRuns: runs.filter((run) => ["failed", "blocked"].includes(String(run.status))).length,
    latestRunAt: latest ? String(latest.started_at) : null, latestRunStatus: latest ? String(latest.status) : null, selectedCandidates: selected, candidatesBeforeExclusion: before,
    excludedCandidates: excluded, candidatesAfterExclusion: knownExclusions ? selected : null, detailAttempts: runs.length ? runs.filter((run) => run.source === "jobkorea").reduce((sum, run) => sum + n(run.selected_detail_count), 0) : null,
    successfulDetailParses: detailSuccesses, listingFallbacks: fallbacks, inserted, updated, unchanged, lowerCompletenessSkips: skipped, failedItems,
    totalDurationMs: totalDuration, averageDurationMs: totalDuration === null ? null : Math.round(totalDuration / runs.length), averageSelectedCandidates: selected === null || !runs.length ? null : Math.round(selected / runs.length * 10) / 10,
    exclusionRate: rate(excluded, before), failureRate: rate(failedItems, selected), insertUpdateRate: rate(inserted + updated, selected), validRecordYield: rate(inserted + updated + unchanged + skipped, selected), listingFallbackRate: rate(fallbacks, selected),
    revisionsRepresented: [...revisionCounts].sort((a, b) => a[0] - b[0]).map(([revision, count]) => ({ revision, runs: count })), latestRunRevision: latest ? optionalNumber(latest.saved_profile_revision) : null,
    currentRevisionUsed: runs.some((run) => Number(run.saved_profile_revision) === profile.revision && run.saved_profile_configuration_hash === profile.configurationHash), historicalConfigurationHashesDiffer: hashes.size > 1,
    recentRuns: runs.slice(0, 5).map((run) => ({ id: String(run.id), status: String(run.status), startedAt: String(run.started_at), completedAt: optionalString(run.completed_at), revision: optionalNumber(run.saved_profile_revision), configurationHash: optionalString(run.saved_profile_configuration_hash), selectedCandidates: run.exclusion_config_hash ? optionalNumber(run.selected_candidate_count_after_exclusion) : optionalNumber(run.selected_detail_count), inserted: n(run.inserted_count), updated: n(run.updated_count), unchanged: n(run.unchanged_count), skipped: n(run.skipped_count), failed: n(run.failed_count) })) };
}

function observedIdentities(runs: Row[], itemsByRun: Map<string, Row[]>): Set<string> {
  const identities = new Set<string>();
  for (const run of runs) for (const item of itemsByRun.get(String(run.id)) ?? []) if (SUCCESS_RESULTS.has(String(item.result)) && typeof item.source_posting_id === "string" && item.source_posting_id.trim()) identities.add(`${item.source}:${item.source_posting_id.trim()}`);
  return identities;
}

function overlapComparison(profiles: SavedCollectionProfile[], sets: Map<string, Set<string>>): ProfileOverlapComparison {
  const pairs: ProfilePairOverlap[] = [];
  for (let a = 0; a < profiles.length; a += 1) for (let b = a + 1; b < profiles.length; b += 1) {
    const pa = profiles[a]!; const pb = profiles[b]!;
    if (pa.source !== pb.source) { pairs.push({ profileAId: pa.id, profileBId: pb.id, applicable: false, source: null, profileAIdentities: null, profileBIdentities: null, sharedIdentities: null, uniqueToA: null, uniqueToB: null, overlapPercentage: null, jaccardSimilarity: null, sharedSampleIds: [], uniqueSampleIdsA: [], uniqueSampleIdsB: [] }); continue; }
    const sa = sets.get(pa.id)!; const sb = sets.get(pb.id)!; const shared = [...sa].filter((id) => sb.has(id)); const uniqueA = [...sa].filter((id) => !sb.has(id)); const uniqueB = [...sb].filter((id) => !sa.has(id)); const union = new Set([...sa, ...sb]).size; const smaller = Math.min(sa.size, sb.size);
    pairs.push({ profileAId: pa.id, profileBId: pb.id, applicable: true, source: pa.source, profileAIdentities: sa.size, profileBIdentities: sb.size, sharedIdentities: shared.length, uniqueToA: uniqueA.length, uniqueToB: uniqueB.length,
      overlapPercentage: smaller ? Math.round(shared.length / smaller * 1000) / 10 : null, jaccardSimilarity: union ? Math.round(shared.length / union * 1000) / 10 : null,
      sharedSampleIds: postingSamples(shared), uniqueSampleIdsA: postingSamples(uniqueA), uniqueSampleIdsB: postingSamples(uniqueB) });
  }
  const sameSource = new Set(profiles.map((profile) => profile.source)).size === 1; let allShared: string[] = [];
  if (sameSource) allShared = [...sets.get(profiles[0]!.id)!].filter((id) => profiles.slice(1).every((profile) => sets.get(profile.id)!.has(id)));
  return { pairs, sharedByAll: sameSource && profiles.every((profile) => sets.get(profile.id)!.size > 0) ? allShared.length : null, sharedByAllSampleIds: postingSamples(allShared),
    uniqueByProfile: profiles.map((profile) => { if (!sameSource) return { profileId: profile.id, count: null, sampleIds: [] }; const own = sets.get(profile.id)!; const others = new Set(profiles.filter((other) => other.id !== profile.id).flatMap((other) => [...sets.get(other.id)!])); const unique = [...own].filter((id) => !others.has(id)); return { profileId: profile.id, count: own.size ? unique.length : null, sampleIds: postingSamples(unique) }; }), crossSourceLimited: !sameSource };
}

function legacyLimitations(runs: Row[], scope: "current" | "all"): string[] {
  const result: string[] = [];
  if (scope === "current" && runs.some((run) => run.saved_profile_configuration_hash === null || run.saved_profile_revision === null)) result.push("리비전 또는 구성 hash가 없는 이전 실행은 현재 리비전 비교에서 제외했습니다.");
  if (runs.some((run) => run.exclusion_config_hash === null)) result.push("이전 형식 실행의 제외 후보 수는 정보 없음으로 유지합니다.");
  return result;
}

function sumKnown(rows: Row[], get: (row: Row) => number | null): number | null { if (!rows.length) return null; const values = rows.map(get); return values.some((value) => value === null) ? null : (values as number[]).reduce((a, b) => a + b, 0); }
function duration(run: Row): number | null { const completed = optionalString(run.completed_at); if (!completed) return null; return Math.max(0, new Date(completed).getTime() - new Date(String(run.started_at)).getTime()); }
function codes(item: Row): string[] { try { const parsed: unknown = JSON.parse(String(item.diagnostic_codes)); return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string") : []; } catch { return []; } }
function postingSamples(values: string[]): string[] { return values.map((value) => value.slice(value.indexOf(":") + 1)).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).slice(0, 10); }
