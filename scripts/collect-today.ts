import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../src/db/connection";
import { listAppliedMigrations } from "../src/db/migrate";
import { REQUIRED_MIGRATION_VERSION } from "../src/db/schema";
import { resolveTodayScope } from "../src/services/collection-date";
import { normalizeCollectionExclusionConfig, type CollectionExclusionConfig, type ExclusionField } from "../src/services/collection-exclusion";
import { getJobKoreaCollectionPreset } from "../src/sources/jobkorea/collection/jobkorea-collection-presets";
import { backfillJobKoreaListingsOnce } from "../src/sources/jobkorea/backfill/jobkorea-backfill-service";
import { JOBKOREA_TODAY_ENDPOINT } from "../src/sources/jobkorea/today/jobkorea-http-today";
import { collectAlbamonOnce } from "../src/sources/albamon/collection/albamon-collection-service";

type Source = "jobkorea" | "albamon";
type Region = "seoul" | "gyeonggi";
type Mode = "dry-run" | "write";
interface Config { sources: Source[]; regions: Region[]; jobKoreaMaxPages: number; albamonMaxPages: number; maxCandidatesPerSource: number; exclusion: CollectionExclusionConfig; mode: Mode; runDate: string }
interface SourceSummary { source: string; status: string; pages: number; links: number; unique: number; dates?: { today: number; older: number; unknown: number; futureInvalid: number }; dateExamples: string[]; selected: number; predicted: number[]; actual: number[]; metadata?: Record<string, number>; metadataExamples?: unknown[]; salary?: { displayPresent:number;displayMissing:number;annualStructured:number;monthlyStructured:number;otherStructured:number;validUnstructured:number;rejectedCandidates:number;examples:string[] }; stopReason?: string; transport?: string }
const AUTH_PATH = resolve("artifacts/runtime/today-authorization.json");
const CONFIRMATION = "COLLECT TODAY";

function numberArg(argv: string[], name: string, fallback: number, maximum: number): number {
  const index = argv.indexOf(name); const value = index < 0 ? fallback : Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  return value;
}
function valueArg(argv: string[], name: string): string | null { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1] ?? null; }
function repeatedArgs(argv: string[], name: string): string[] {
  return argv.flatMap((value, index) => value === name && argv[index + 1] ? [argv[index + 1]!] : []);
}
function parse(): Config {
  const argv = process.argv.slice(2); const dryRun = argv.includes("--dry-run"), write = argv.includes("--write");
  if (dryRun === write) throw new Error("Choose exactly one of --dry-run or --write");
  if (dryRun && !argv.includes("--confirm")) throw new Error("Dry-run requires --confirm");
  if (write && valueArg(argv, "--confirm-today") !== CONFIRMATION) throw new Error(`Write requires --confirm-today "${CONFIRMATION}"`);
  const sourceValue = valueArg(argv, "--sources") ?? "jobkorea,albamon";
  const regionValue = valueArg(argv, "--regions") ?? "seoul,gyeonggi";
  const sources: Source[] = sourceValue === "both" ? ["jobkorea", "albamon"] : sourceValue.split(",") as Source[];
  const regions: Region[] = regionValue === "capital" ? ["seoul", "gyeonggi"] : regionValue.split(",") as Region[];
  if (!sources.length || sources.some((value) => !["jobkorea", "albamon"].includes(value)) || new Set(sources).size !== sources.length) throw new Error("Invalid --sources");
  if (!regions.length || regions.some((value) => !["seoul", "gyeonggi"].includes(value)) || new Set(regions).size !== regions.length) throw new Error("Invalid --regions");
  const exclusion = normalizeCollectionExclusionConfig({ keywords: repeatedArgs(argv, "--exclude-keyword"), fields: repeatedArgs(argv, "--exclude-field") as ExclusionField[] });
  const scope = resolveTodayScope();
  const albamonPageFlag = argv.includes("--albamon-max-pages") ? "--albamon-max-pages" : "--albamon-max-pages-per-region";
  return { sources, regions, jobKoreaMaxPages: numberArg(argv, "--jobkorea-max-pages", 100, 100),
    albamonMaxPages: numberArg(argv, albamonPageFlag, 50, 100),
    maxCandidatesPerSource: numberArg(argv, "--max-candidates-per-source", 5000, 5000), exclusion, mode: write ? "write" : "dry-run", runDate: scope.resolvedDate };
}
const stable = (config: Config) => JSON.stringify({ ...config, mode: undefined });
const hash = (config: Config) => createHash("sha256").update(stable(config)).digest("hex");
interface TodayAuthorization { hash:string;runDate:string;expiresAt:string;dryRunCandidateCounts?:Record<string,number> }
function assertAuthorization(config: Config): TodayAuthorization {
  if (!existsSync(AUTH_PATH)) throw new Error("Run the matching dry-run first");
  const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as TodayAuthorization;
  if (auth.hash !== hash(config) || auth.runDate !== config.runDate || Date.parse(auth.expiresAt) < Date.now()) throw new Error("Today dry-run authorization is missing, expired, or does not match");
  return auth;
}

async function main(): Promise<void> {
  const config = parse();
  const authorization=config.mode === "write"?assertAuthorization(config):null;
  const database = config.mode === "write" ? openWritableDatabase(getDatabasePath()) : openReadonlyDatabase(getDatabasePath());
  const summaries: SourceSummary[] = [];
  try {
    if (!listAppliedMigrations(database).includes(REQUIRED_MIGRATION_VERSION)) throw new Error(`Migration ${REQUIRED_MIGRATION_VERSION} is required`);
    console.log(`오늘 공고 수집 ${config.mode} · ${config.runDate} Asia/Seoul`);
    console.log("detail requests=0 · BFF requests=0 · retries=0 · manual only");
    if (config.sources.includes("jobkorea")) {
      const preset = getJobKoreaCollectionPreset("capital-ai")!;
      const result = await backfillJobKoreaListingsOnce({ presetId: "capital-ai", presetLabel: "오늘 잡코리아 수도권 (검증된 AI 검색)", keyword: preset.keyword,
        searchUrl: JOBKOREA_TODAY_ENDPOINT, pageFrom: 1, pageTo: config.jobKoreaMaxPages,
        maxCandidates: config.maxCandidatesPerSource, listingOnly: true, mode: config.mode, exclusion: config.exclusion,
        localTodayMode: true, collectionDate: { timezone: "Asia/Seoul", resolvedDate: config.runDate }, requestedRegions: config.regions }, { database });
      const observedUnique = new Set(result.pageResults.flatMap((page) => (page.collectionCandidates ?? []).map((candidate) => candidate.postingId))).size;
      summaries.push({ source: "jobkorea", status: result.status, pages: result.pagesCompleted, links: result.linksExtracted,
        unique: observedUnique, ...(result.postingDateCounts ? { dates: result.postingDateCounts } : {}), dateExamples: result.postingDateEvidenceExamples ?? [], selected: result.selectedCandidates,
        predicted: [result.predictedInserts, result.predictedUpdates, result.predictedUnchanged], actual: [result.actualInserts, result.actualUpdates, result.actualUnchanged],
        salary: { displayPresent: result.salaryDisplayPresent, displayMissing: result.salaryDisplayMissing,
          annualStructured: result.annualStructuredSalary, monthlyStructured: result.monthlyStructuredSalary,
          otherStructured: result.otherStructuredSalary, validUnstructured: result.validUnstructuredSalary,
          rejectedCandidates: result.rejectedSalaryCandidates, examples: result.salaryExamples },
        ...(result.postingDateKinds ? { metadata: result.postingDateKinds } : {}), ...(result.stopReason ? { stopReason: result.stopReason } : {}),
        transport: result.transportUsed });
    }
    if (config.sources.includes("albamon")) {
      const result = await collectAlbamonOnce({ presetId: "albamon-capital-today",
        presetLabel: "알바몬 서울·경기 오늘 등록", pages: config.albamonMaxPages,
        maxDetails: config.maxCandidatesPerSource, mode: config.mode, confirm: true, requestedRegions: config.regions, exclusion: config.exclusion,
        localTodayMode: true, collectionDate: { timezone: "Asia/Seoul", resolvedDate: config.runDate } }, { database });
      summaries.push({ source: "albamon:capital", status: result.status, pages: result.listingPagesCompleted, links: result.numericLinksExtracted,
        unique: result.observedUniquePostingIds ?? result.uniquePostingIds, ...(result.postingDateCounts ? { dates: result.postingDateCounts } : {}), dateExamples: result.postingDateEvidenceExamples ?? [], selected: result.candidatesSelected,
        predicted: [result.predictedInserts, result.predictedUpdates, result.predictedUnchanged], actual: [result.actualInserts, result.actualUpdates, result.actualUnchanged],
        metadata: { sourceFilterTodayEligible: result.sourceFilterTodayEligible ?? 0, registeredMetadataRecords: result.registeredMetadataRecords ?? 0,
          displayedLocationRecords: result.displayedLocationRecords, sourceFilterOnlyRecords: result.sourceFilterOnlyRecords,
          exactSeoul: result.seoulMatches, exactGyeonggi: result.gyeonggiMatches, capitalScope: result.capitalScopeMatches,
          regionConflicts: result.regionConflicts, workplaceAddressRecords: result.workplaceAddressRecords,
          coordinatesAccepted: result.coordinatesAccepted, coordinatesSuppressedDueConflict: result.coordinatesSuppressedDueConflict,
          salaryDisplayPresent: result.salaryDisplayPresent, salaryDisplayMissing: result.salaryDisplayMissing,
          monthlyStructuredSalary: result.monthlyStructuredSalary, hourlyStructuredSalary: result.hourlyStructuredSalary,
          dailyStructuredSalary: result.dailyStructuredSalary, validUnstructuredSalary: result.validUnstructuredSalary,
          rejectedSalaryCandidates: result.rejectedSalaryCandidates, payTheDayRecords: result.payTheDayRecords,
          payTheDaySalaryRecords: result.payTheDaySalaryRecords, scheduleRecords: result.scheduleRecords,
          todayPostingDateContradictions: result.todayPostingDateContradictions, deadlineRecords: result.deadlineRecords,
          employmentTypeRecords: result.employmentTypeRecords }, ...(result.metadataExamples ? { metadataExamples: result.metadataExamples } : {}) });
    }
    console.log(JSON.stringify({ config, summaries }, null, 2));
    if(authorization){
      const parity=Object.fromEntries(summaries.map(summary=>{const dryRunCandidateCount=authorization.dryRunCandidateCounts?.[summary.source]??null;const writeCandidateCount=summary.selected;const candidateDelta=dryRunCandidateCount===null?null:writeCandidateCount-dryRunCandidateCount;return[summary.source,{dryRunCandidateCount,writeCandidateCount,candidateDelta,newSinceDryRun:candidateDelta===null?null:Math.max(0,candidateDelta)}];}));
      console.log(JSON.stringify({candidateParity:parity,note:"Live write refetches the bound date/configuration; positive deltas can be postings published after dry-run."},null,2));
    }
    if (config.mode === "dry-run") {
      if (!summaries.some((summary) => summary.status === "completed" && summary.selected > 0)) throw new Error("TODAY_COLLECTION_WRITE_GATE_FAILED: no source produced a date-verified today candidate");
      mkdirSync(dirname(AUTH_PATH), { recursive: true });
      writeFileSync(AUTH_PATH, JSON.stringify({ hash: hash(config), runDate: config.runDate, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),dryRunCandidateCounts:Object.fromEntries(summaries.map(summary=>[summary.source,summary.selected])) }, null, 2));
      console.log(`쓰기 승인 생성: ${config.runDate} (30분)`);
    } else rmSync(AUTH_PATH, { force: true });
  } finally { database.close(); }
}
main().catch((error) => { console.error(`[TODAY_COLLECTION_FAILED] ${error instanceof Error ? error.message : "unknown"}`); process.exitCode = 1; });
