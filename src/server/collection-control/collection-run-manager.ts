import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../../db/connection";
import { collectJobKoreaOnce } from "../../sources/jobkorea/collection/jobkorea-collection-service";
import { buildJobKoreaKeywordSearchUrl } from "../../sources/jobkorea/collection/jobkorea-collection-presets";
import type { JobKoreaCollectionDependencies, JobKoreaCollectionProgress } from "../../sources/jobkorea/collection/jobkorea-collection-types";
import { collectAlbamonOnce } from "../../sources/albamon/collection/albamon-collection-service";
import type { AlbamonCollectionDependencies } from "../../sources/albamon/collection/albamon-collection-types";
import { getCollectionPreset, type CollectionPreset } from "../../sources/collection/collection-presets";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";
import { normalizeCollectionExclusionConfig } from "../../services/collection-exclusion";
import { exclusionConfigurationHash } from "../../services/collection-exclusion-hash.server";
import { SavedCollectionProfileRepository } from "../collection-profiles/repository";
import type { CollectionControlConfig, CollectionControlMode, CollectionRunSnapshot } from "./contracts";
import { acquireCollectionRun, activeCollectionRunOwner, releaseCollectionRun } from "./run-lock";

const WRITE_AUTH_TTL_MS = 30 * 60_000;
const MAX_RETAINED_RUNS = 20;
interface WriteAuthorization { token: string; configKey: string; dryRunId: string; expiresAt: number; used: boolean }
interface StartRequest extends Omit<CollectionControlConfig, "exclusion" | "savedProfile"> { profileId?: string; exclusion?: CollectionControlConfig["exclusion"]; mode: CollectionControlMode; writeAuthorizationToken?: string; confirmationPhrase?: string }
interface ResolvedConfiguration { preset: CollectionPreset; config: CollectionControlConfig; keyword: string | null; regions: Array<"seoul" | "gyeonggi">; allowListingFallback: boolean }
export interface CollectionRunManagerDependencies { runCollection?: typeof collectJobKoreaOnce; runAlbamonCollection?: typeof collectAlbamonOnce; openReadonly?: typeof openReadonlyDatabase; openWritable?: typeof openWritableDatabase; now?: () => Date; collectionDependencies?: Partial<JobKoreaCollectionDependencies>; albamonDependencies?: Partial<AlbamonCollectionDependencies>; loadProfile?: (id: string) => SavedCollectionProfile | null; markProfileUsed?: (id: string) => void }

const initialProgress = (pages: number): JobKoreaCollectionProgress => ({ status: "preparing", message: "수집 준비 중", listingPagesRequested: pages,
  listingPagesCompleted: 0, numericLinksExtracted: 0, uniquePostingIds: 0, regionMatchingCandidates: 0, selectedCandidates: 0,
  candidatesBeforeExclusion: 0, candidatesExcluded: 0, candidatesAfterExclusion: 0, detailAttemptsCompleted: 0, detailAttemptsTotal: 0,
  successfulDetailParses: 0, listingFallbacks: 0, failedRecords: 0, predictedInserts: 0, predictedUpdates: 0, predictedUnchanged: 0,
  actualInserts: 0, actualUpdates: 0, actualUnchanged: 0, lowerCompletenessSkips: 0 });

export { exclusionConfigurationHash } from "../../services/collection-exclusion-hash.server";
const configKey = (config: CollectionControlConfig): string => `${getCollectionPreset(config.presetId)?.source ?? "unknown"}:${config.presetId}:${config.pages}:${config.maxDetails}:${exclusionConfigurationHash(config.exclusion)}:${config.savedProfile ? `${config.savedProfile.id}:${config.savedProfile.revision}:${config.savedProfile.configurationHash}` : "builtin"}`;
const safeError = (error: unknown) => ({ code: error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "COLLECTION_RUN_FAILED",
  message: error instanceof Error ? error.message.slice(0, 500) : "수집 실행에 실패했습니다." });

export class CollectionRunManager {
  private activeId: string | null = null;
  private readonly runs = new Map<string, CollectionRunSnapshot>();
  private readonly authorizations = new Map<string, WriteAuthorization>();
  constructor(private readonly dependencies: CollectionRunManagerDependencies = {}) {}

  start(input: StartRequest): CollectionRunSnapshot {
    if (this.activeId || activeCollectionRunOwner()) throw Object.assign(new Error("이미 실행 중인 수집이 있습니다."), { code: "COLLECTION_RUN_CONFLICT", status: 409 });
    const resolved = this.resolve(input); const { preset, config } = resolved;
    if (input.mode !== "dry_run" && input.mode !== "write") throw Object.assign(new Error("올바른 실행 모드가 아닙니다."), { code: "COLLECTION_MODE_INVALID", status: 400 });
    if (input.mode === "write") this.consumeWriteAuthorization(input, config);
    const now = this.clock(); const runId = randomUUID(); const progress = initialProgress(config.pages);
    const snapshot: CollectionRunSnapshot = { ...progress, runId, mode: input.mode, presetId: preset.id,
      presetLabel: config.savedProfile?.name ?? preset.label, source: preset.source, maxDetailsRequested: config.maxDetails,
      exclusion: config.exclusion, exclusionConfigHash: exclusionConfigurationHash(config.exclusion), savedProfile: config.savedProfile ?? null,
      startedAt: now.toISOString(), updatedAt: now.toISOString(), elapsedMs: 0, result: null, error: null,
      writeAuthorizationToken: null, writeAuthorizationExpiresAt: null };
    acquireCollectionRun(`collection:${runId}`); this.runs.set(runId, snapshot); this.activeId = runId; this.trim();
    if (input.mode === "write" && config.savedProfile) this.markProfileUsed(config.savedProfile.id);
    void this.execute(runId, resolved, input.mode); return structuredClone(snapshot);
  }

  active(): CollectionRunSnapshot | null { return this.activeId ? this.get(this.activeId) : null; }
  get(runId: string): CollectionRunSnapshot | null { const value = this.runs.get(runId); return value ? structuredClone(value) : null; }

  private resolve(input: StartRequest): ResolvedConfiguration {
    const profile = input.profileId ? this.loadProfile(input.profileId) : null;
    if (input.profileId && !profile) throw Object.assign(new Error("저장 프로필을 찾을 수 없습니다."), { code: "PROFILE_NOT_FOUND", status: 404 });
    const presetId = profile?.basePresetId ?? input.presetId; const preset = getCollectionPreset(presetId);
    if (!preset || (profile && (profile.source !== preset.source || input.presetId !== preset.id))) throw Object.assign(new Error("알 수 없거나 일치하지 않는 수집 프리셋입니다."), { code: "COLLECTION_PRESET_INVALID", status: 400 });
    const maxPages = profile?.pages ?? preset.pages; const maxDetails = profile?.maxCandidates ?? preset.maxDetails;
    if (!Number.isInteger(input.pages) || input.pages < 1 || input.pages > maxPages || input.pages > 5) throw Object.assign(new Error("페이지 수가 프로필 또는 프리셋 한도를 벗어났습니다."), { code: "COLLECTION_PAGES_INVALID", status: 400 });
    if (!Number.isInteger(input.maxDetails) || input.maxDetails < 1 || input.maxDetails > maxDetails || input.maxDetails > 50) throw Object.assign(new Error("후보 수가 프로필 또는 프리셋 한도를 벗어났습니다."), { code: "COLLECTION_MAX_DETAILS_INVALID", status: 400 });
    const exclusion = profile ? profile.exclusion : normalizeCollectionExclusionConfig(input.exclusion);
    if (profile && input.exclusion && exclusionConfigurationHash(input.exclusion) !== exclusionConfigurationHash(profile.exclusion)) throw Object.assign(new Error("저장 프로필의 제외 설정과 실행 요청이 일치하지 않습니다."), { code: "PROFILE_CONFIGURATION_CHANGED", status: 409 });
    const savedProfile = profile ? { id: profile.id, name: profile.name, revision: profile.revision, configurationHash: profile.configurationHash } : null;
    return { preset, config: { presetId: preset.id, pages: input.pages, maxDetails: input.maxDetails, exclusion, savedProfile },
      keyword: profile?.keyword ?? (preset.source === "jobkorea" ? preset.keyword : null), regions: profile?.regions ?? preset.regions,
      allowListingFallback: profile?.allowListingFallback ?? (preset.source === "jobkorea" ? preset.allowListingFallback : false) };
  }

  private consumeWriteAuthorization(input: StartRequest, config: CollectionControlConfig): void {
    if (input.confirmationPhrase !== `WRITE ${config.presetId}`) throw Object.assign(new Error("쓰기 확인 문구가 일치하지 않습니다."), { code: "COLLECTION_WRITE_CONFIRMATION_INVALID", status: 400 });
    const auth = input.writeAuthorizationToken ? this.authorizations.get(input.writeAuthorizationToken) : null;
    if (!auth || auth.used || auth.expiresAt <= this.clock().getTime()) throw Object.assign(new Error("드라이런 쓰기 승인이 없거나 만료되었습니다."), { code: "COLLECTION_WRITE_AUTH_EXPIRED", status: 403 });
    if (auth.configKey !== configKey(config)) throw Object.assign(new Error("드라이런 이후 프로필 또는 실행 설정이 변경되었습니다."), { code: "COLLECTION_WRITE_CONFIG_CHANGED", status: 409 });
    auth.used = true;
  }

  private async execute(runId: string, resolved: ResolvedConfiguration, mode: CollectionControlMode): Promise<void> {
    const started = this.clock().getTime(); const { preset, config } = resolved;
    const open = mode === "write" ? (this.dependencies.openWritable ?? openWritableDatabase) : (this.dependencies.openReadonly ?? openReadonlyDatabase);
    let database: ReturnType<typeof openReadonlyDatabase> | null = null;
    try {
      database = open(getDatabasePath());
      const onProgress = (progress: JobKoreaCollectionProgress) => { this.update(runId, progress, started); try { this.dependencies.collectionDependencies?.onProgress?.(progress); } catch { return; } };
      const common = { presetId: preset.id, presetLabel: config.savedProfile?.name ?? preset.label, pages: config.pages as 1|2|3|4|5, maxDetails: config.maxDetails,
        mode: mode === "write" ? "write" as const : "dry-run" as const, confirm: true as const, requestedRegions: resolved.regions,
        exclusion: config.exclusion, exclusionConfigHash: exclusionConfigurationHash(config.exclusion), savedProfile: config.savedProfile ?? null };
      const result = preset.source === "jobkorea"
        ? await (this.dependencies.runCollection ?? collectJobKoreaOnce)({ ...common, searchUrl: buildJobKoreaKeywordSearchUrl(resolved.keyword!),
          allowListingFallback: resolved.allowListingFallback, keyword: resolved.keyword! }, { ...this.dependencies.collectionDependencies, database, onProgress })
        : await (this.dependencies.runAlbamonCollection ?? collectAlbamonOnce)(common, { ...this.dependencies.albamonDependencies, database, onProgress });
      const current = this.runs.get(runId)!; current.result = result; current.status = "completed"; current.message = "수집 완료";
      if (mode === "dry_run" && result.successfullyParsed + result.listingOnlyRecords > 0) {
        const token = randomUUID(); const expiresAt = this.clock().getTime() + WRITE_AUTH_TTL_MS;
        this.authorizations.set(token, { token, configKey: configKey(config), dryRunId: runId, expiresAt, used: false });
        current.writeAuthorizationToken = token; current.writeAuthorizationExpiresAt = new Date(expiresAt).toISOString();
      }
      this.touch(current, started);
    } catch (error) { const current = this.runs.get(runId)!; current.status = "failed"; current.message = "수집 실행 실패"; current.error = safeError(error); this.touch(current, started); }
    finally { database?.close(); if (this.activeId === runId) this.activeId = null; releaseCollectionRun(`collection:${runId}`); }
  }

  private loadProfile(id: string): SavedCollectionProfile | null { if (this.dependencies.loadProfile) return this.dependencies.loadProfile(id); const database = openReadonlyDatabase(getDatabasePath()); try { return new SavedCollectionProfileRepository(database).get(id); } finally { database.close(); } }
  private markProfileUsed(id: string): void { if (this.dependencies.markProfileUsed) return this.dependencies.markProfileUsed(id); const database = openWritableDatabase(getDatabasePath()); try { new SavedCollectionProfileRepository(database).markLastUsed(id); } finally { database.close(); } }
  private clock(): Date { return (this.dependencies.now ?? (() => new Date()))(); }
  private update(runId: string, progress: JobKoreaCollectionProgress, started: number): void { const current = this.runs.get(runId); if (!current) return; Object.assign(current, progress, { status: progress.status === "completed" ? current.status : progress.status }); this.touch(current, started); }
  private touch(snapshot: CollectionRunSnapshot, started: number): void { const now = this.clock(); snapshot.updatedAt = now.toISOString(); snapshot.elapsedMs = Math.max(0, now.getTime() - started); }
  private trim(): void { while (this.runs.size > MAX_RETAINED_RUNS) { const first = this.runs.keys().next().value as string | undefined; if (!first || first === this.activeId) break; this.runs.delete(first); } }
}

const GLOBAL_KEY = Symbol.for("nearby-jobs.collection-run-manager");
type GlobalWithManager = typeof globalThis & { [GLOBAL_KEY]?: CollectionRunManager };
export function getCollectionRunManager(): CollectionRunManager { const scope = globalThis as GlobalWithManager; return scope[GLOBAL_KEY] ??= new CollectionRunManager(); }
