import "server-only";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../../db/connection";
import { createBackup } from "../backups/backup-service";
import { acquireCollectionRun, activeCollectionRunOwner, releaseCollectionRun } from "../collection-control/run-lock";
import { collectAlbamonOnce } from "../../sources/albamon/collection/albamon-collection-service";
import { backfillJobKoreaListingsOnce } from "../../sources/jobkorea/backfill/jobkorea-backfill-service";
import { JOBKOREA_TODAY_ENDPOINT } from "../../sources/jobkorea/today/jobkorea-http-today";
import { canonicalizeExclusionConfig, canonicalizeImportedExclusionConfig } from "../../services/collection-exclusion";
import { resolvePostingDateAtCutoff } from "../../services/collection-date";
import type { ManualBackfillConfig, ManualBackfillMode, ManualBackfillResult, ManualBackfillSnapshot } from "./contracts";
import { resolveBackfillConfig, type BackfillConfigInput } from "./profile-resolution";
import type { PersonalAlbamonProfileState } from "../personal-albamon-profile/service";
import { PERSONAL_ALBAMON_AREAS, PERSONAL_ALBAMON_PAGE_SIZE, PERSONAL_ALBAMON_PERIOD,
  PERSONAL_ALBAMON_SORT } from "../../services/personal-albamon-profile";

const AUTH_TTL_MS = 30 * 60_000;
interface Authorization {
  token:string; key:string; previewRunId:string; completedAt:number; expiresAt:number; selected:number;
  fullExhausted:true; stopReason:string; parserErrors:0; used:boolean;
}
export interface ManualBackfillManagerDependencies {
  databasePath?: string;
  openReadonly?: (path?: string) => Database.Database;
  openWritable?: (path?: string) => Database.Database;
  runAlbamon?: typeof collectAlbamonOnce;
  runJobKorea?: typeof backfillJobKoreaListingsOnce;
  createBackup?: typeof createBackup;
  now?: () => Date;
  loadPersonalProfile?: () => PersonalAlbamonProfileState;
}
interface StartInput extends BackfillConfigInput { mode:ManualBackfillMode; writeAuthorizationToken?:string; confirmationPhrase?:string }

const authorizationTarget=(config:ManualBackfillConfig)=>config.scope==="albamon_personal_all"?"ALL":config.cutoffDate;
const key=(config:ManualBackfillConfig)=>JSON.stringify({version:5,source:config.source,scope:config.scope,
  cutoffDate:config.cutoffDate,maxPages:config.maxPages,areas:PERSONAL_ALBAMON_AREAS,
  searchPeriodType:config.scope==="albamon_personal_all"?PERSONAL_ALBAMON_PERIOD:null,
  sortType:config.scope==="albamon_personal_all"?PERSONAL_ALBAMON_SORT:"registration",excludeBar:config.source==="albamon",
  pageSize:PERSONAL_ALBAMON_PAGE_SIZE,personalProfileHash:config.personalProfileHash,
  exclusion:config.scope==="albamon_personal_all"?canonicalizeImportedExclusionConfig(config.exclusion):canonicalizeExclusionConfig(config.exclusion)});
const safeExhaustion=(config:ManualBackfillConfig,stopReason:string)=>config.scope==="albamon_personal_all"
  ? ["source_total_exhausted","empty_page","explicit_empty","zero_valid_rows"].includes(stopReason)
  : ["cutoff_reached","empty_page","explicit_empty","zero_valid_rows"].includes(stopReason);
const safeError=(error:unknown)=>({code:error&&typeof error==="object"&&"code" in error?String(error.code):"BACKFILL_FAILED",
  message:(error instanceof Error?error.message:"백필 실행에 실패했습니다.").slice(0,500)});

export class ManualBackfillManager {
  private activeId:string|null=null;
  private readonly runs=new Map<string,ManualBackfillSnapshot>();
  private readonly authorizations=new Map<string,Authorization>();
  private readonly controllers=new Map<string,AbortController>();
  constructor(private readonly dependencies:ManualBackfillManagerDependencies={}){}

  start(raw:StartInput):ManualBackfillSnapshot{
    if(this.activeId||activeCollectionRunOwner())throw Object.assign(new Error("이미 실행 중인 수집 작업이 있습니다."),{code:"BACKFILL_CONFLICT",status:409});
    const config=resolveBackfillConfig(raw,this.dependencies.loadPersonalProfile);const now=this.clock();
    if(config.cutoffDate&&config.cutoffDate>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(now))throw Object.assign(new Error("미래 날짜는 선택할 수 없습니다."),{code:"BACKFILL_CUTOFF_INVALID",status:400});
    let drySelected:number|null=null;
    if(raw.mode==="write")drySelected=this.consumeAuthorization(raw,config);
    const id=randomUUID();acquireCollectionRun(`backfill:${id}`);const controller=new AbortController();this.controllers.set(id,controller);
    const snapshot:ManualBackfillSnapshot={...config,id,mode:raw.mode,status:"preparing",currentPage:0,recordsSeen:0,uniqueRecords:0,oldestPostingDate:null,
      startedAt:now.toISOString(),updatedAt:now.toISOString(),elapsedMs:0,result:null,error:null,writeAuthorizationToken:null,writeAuthorizationExpiresAt:null};
    this.runs.set(id,snapshot);this.activeId=id;void this.execute(id,config,raw.mode,controller,drySelected);return structuredClone(snapshot);
  }
  active(){return this.activeId?this.get(this.activeId):null;}
  get(id:string){const run=this.runs.get(id);return run?structuredClone(run):null;}
  cancel(id:string):ManualBackfillSnapshot|null{const run=this.runs.get(id);if(!run||this.activeId!==id)return run?structuredClone(run):null;this.controllers.get(id)?.abort();run.status="cancelled";run.updatedAt=this.clock().toISOString();return structuredClone(run);}

  private consumeAuthorization(input:StartInput,config:ManualBackfillConfig):number{
    if(input.confirmationPhrase!==`BACKFILL ${config.source} ${authorizationTarget(config)}`)throw Object.assign(new Error("백필 확인 문구가 일치하지 않습니다."),{code:"BACKFILL_CONFIRMATION_INVALID",status:400});
    const auth=input.writeAuthorizationToken?this.authorizations.get(input.writeAuthorizationToken):null;
    if(!auth||auth.used||auth.expiresAt<=this.clock().getTime())throw Object.assign(new Error("백필 미리보기 승인이 없거나 만료되었습니다."),{code:"BACKFILL_AUTH_EXPIRED",status:403});
    if(auth.key!==key(config))throw Object.assign(new Error("미리보기 이후 백필 설정이 변경되었습니다."),{code:"BACKFILL_CONFIG_CHANGED",status:409});auth.used=true;return auth.selected;
  }
  private async execute(id:string,config:ManualBackfillConfig,mode:ManualBackfillMode,controller:AbortController,drySelected:number|null){
    const started=this.clock().getTime();let database:Database.Database|null=null;let backupFile:string|null=null;
    try{
      if(mode==="write"){
        const backup=await(this.dependencies.createBackup??createBackup)(this.path(),resolve(process.env.NEARBY_JOBS_BACKUP_DIR?.trim()||"data/backups"),this.clock());backupFile=backup.filePath;
      }
      database=(mode==="write"?(this.dependencies.openWritable??openWritableDatabase):(this.dependencies.openReadonly??openReadonlyDatabase))(this.path());
      this.update(id,{status:"running"});
      const seen=new Set<string>();
      const onAlbamonPage=(page:Parameters<NonNullable<import("../../sources/albamon/collection/albamon-collection-types").AlbamonCollectionDependencies["onPage"]>>[0])=>{
        for(const candidate of page.candidates)seen.add(candidate.sourcePostingId);const dates=config.cutoffDate?page.candidates.map(candidate=>resolvePostingDateAtCutoff(candidate.postingDateEvidence?.raw??candidate.postingDate,page.observedAt??this.clock().toISOString(),config.cutoffDate!).resolvedDate).filter((value):value is string=>Boolean(value)):[];
        this.update(id,{currentPage:page.pageNumber,recordsSeen:this.runs.get(id)!.recordsSeen+page.candidates.length,uniqueRecords:seen.size,oldestPostingDate:dates.length?[...(this.runs.get(id)!.oldestPostingDate?[this.runs.get(id)!.oldestPostingDate!]:[]),...dates].sort()[0]!:this.runs.get(id)!.oldestPostingDate});
      };
      const onJobKoreaPage=(page:import("../../sources/jobkorea/transport/jobkorea-search-types").JobKoreaListingPageResult)=>{
        const candidates=page.collectionCandidates??[];for(const candidate of candidates)seen.add(candidate.postingId);const dates=candidates.map(candidate=>resolvePostingDateAtCutoff(candidate.listingFields?.postingDateEvidence?.raw,page.observedAt??this.clock().toISOString(),config.cutoffDate!).resolvedDate).filter((value):value is string=>Boolean(value));
        this.update(id,{currentPage:page.pageNumber,recordsSeen:this.runs.get(id)!.recordsSeen+candidates.length,uniqueRecords:seen.size,oldestPostingDate:dates.length?[...(this.runs.get(id)!.oldestPostingDate?[this.runs.get(id)!.oldestPostingDate!]:[]),...dates].sort()[0]!:this.runs.get(id)!.oldestPostingDate});
      };
      let result:ManualBackfillResult;
      if(config.source==="albamon"){
        const source=await(this.dependencies.runAlbamon??collectAlbamonOnce)({presetId:"albamon-capital-all",presetLabel:"알바몬 내 검색조건 전체",pages:config.maxPages,maxDetails:config.maxPages*50,mode:mode==="write"?"write":"dry-run",confirm:true,requestedRegions:["seoul","gyeonggi"],exclusion:config.exclusion,personalProfileBackfill:config.scope==="albamon_personal_all",historicalSortType:config.scope==="albamon_personal_all"?"MONTHLY_SALARY":"POSTED_DATE",...(config.cutoffDate?{backfillCutoffDate:config.cutoffDate}:{}),signal:controller.signal},{database,onPage:onAlbamonPage,now:()=>this.clock()});
        const last=source.pageResults.at(-1);const stopReason=last?.diagnosticCodes.includes("ALBAMON_SOURCE_TOTAL_EXHAUSTED")?"source_total_exhausted":last?.diagnosticCodes.includes("ALBAMON_BACKFILL_CUTOFF_REACHED")?"cutoff_reached":last?.validEmptyPage?"empty_page":last?.blocked?"source_blocked":last?.parserFailure?"parser_failure":controller.signal.aborted?"cancelled":source.pageResults.length>=config.maxPages?"page_limit":"source_failure";
        const parserErrors=source.pageResults.filter(page=>page.parserFailure||page.blocked||page.classification==="transport_failed").length;
        result={pages:source.pageResults.length,records:source.validListingCards,selected:source.candidatesSelected,inserted:mode==="write"?source.actualInserts:source.predictedInserts,updated:mode==="write"?source.actualUpdates:source.predictedUpdates,unchanged:mode==="write"?source.actualUnchanged:source.predictedUnchanged,skipped:mode==="write"?source.actualLowerCompletenessSkips:source.predictedLowerCompletenessSkips,duplicates:Math.max(0,source.validListingCards-(source.observedUniquePostingIds??source.uniquePostingIds)),sourceTotal:source.sourceTotalCount??null,candidatesExcluded:source.candidatesExcluded,monthlyRecords:source.monthlyStructuredSalary,hourlyRecords:source.hourlyStructuredSalary,dailyRecords:source.dailyStructuredSalary,salaryRecords:source.salaryDisplayPresent,coordinateRecords:source.coordinatesAccepted,parserErrors,fullExhausted:parserErrors===0&&safeExhaustion(config,stopReason),oldestPostingDate:this.runs.get(id)!.oldestPostingDate,stopReason,runId:source.runId,preWriteBackupFile:backupFile,dryRunCandidateCount:drySelected,writeCandidateCount:mode==="write"?source.candidatesSelected:null,candidateDelta:mode==="write"&&drySelected!==null?source.candidatesSelected-drySelected:null,newSinceDryRun:mode==="write"&&drySelected!==null?Math.max(0,source.candidatesSelected-drySelected):null};
      }else{
        const source=await(this.dependencies.runJobKorea??backfillJobKoreaListingsOnce)({presetId:"capital-ai",presetLabel:"잡코리아 수도권 과거 공고",keyword:"AI",searchUrl:JOBKOREA_TODAY_ENDPOINT,pageFrom:1,pageTo:config.maxPages,maxCandidates:config.maxPages*50,listingOnly:true,mode:mode==="write"?"write":"dry-run",exclusion:config.exclusion,localTodayMode:true,backfillCutoffDate:config.cutoffDate!,signal:controller.signal,onPage:onJobKoreaPage,requestedRegions:["seoul","gyeonggi"]},{database,now:()=>this.clock()});
        const stopReason=source.stopReason==="older_page"?"cutoff_reached":source.stopReason??"page_limit",parserErrors=source.parserFailurePages;
        result={pages:source.pagesCompleted,records:source.validCards,selected:source.selectedCandidates,inserted:mode==="write"?source.actualInserts:source.predictedInserts,updated:mode==="write"?source.actualUpdates:source.predictedUpdates,unchanged:mode==="write"?source.actualUnchanged:source.predictedUnchanged,skipped:mode==="write"?source.actualSkips:source.predictedSkips,duplicates:source.crossPageDuplicates,sourceTotal:null,candidatesExcluded:source.excludedByKeyword,monthlyRecords:source.monthlyStructuredSalary,hourlyRecords:0,dailyRecords:0,salaryRecords:source.salaryDisplayPresent,coordinateRecords:0,parserErrors,fullExhausted:parserErrors===0&&safeExhaustion(config,stopReason),oldestPostingDate:this.runs.get(id)!.oldestPostingDate,stopReason,runId:source.runId,preWriteBackupFile:backupFile,dryRunCandidateCount:drySelected,writeCandidateCount:mode==="write"?source.selectedCandidates:null,candidateDelta:mode==="write"&&drySelected!==null?source.selectedCandidates-drySelected:null,newSinceDryRun:mode==="write"&&drySelected!==null?Math.max(0,source.selectedCandidates-drySelected):null};
      }
      if(mode==="write"&&result.runId&&backupFile)database.prepare("UPDATE ingestion_runs SET pre_write_backup_file=? WHERE id=?").run(backupFile,result.runId);
      const run=this.runs.get(id)!;run.result=result;run.status=controller.signal.aborted?"cancelled":"completed";
      if(mode==="dry_run"&&run.status==="completed"&&result.fullExhausted&&result.parserErrors===0){
        const completedAt=this.clock().getTime(),token=randomUUID(),expiresAt=completedAt+AUTH_TTL_MS;
        this.authorizations.set(token,{token,key:key(config),previewRunId:id,completedAt,expiresAt,selected:result.selected,
          fullExhausted:true,stopReason:result.stopReason,parserErrors:0,used:false});
        run.writeAuthorizationToken=token;run.writeAuthorizationExpiresAt=new Date(expiresAt).toISOString();
      }
      this.touch(run,started);
    }catch(error){const run=this.runs.get(id)!;run.status=controller.signal.aborted?"cancelled":"failed";run.error=safeError(error);this.touch(run,started);}
    finally{database?.close();this.controllers.delete(id);if(this.activeId===id)this.activeId=null;releaseCollectionRun(`backfill:${id}`);}
  }
  private update(id:string,patch:Partial<ManualBackfillSnapshot>){const run=this.runs.get(id);if(!run)return;Object.assign(run,patch);this.touch(run,Date.parse(run.startedAt));}
  private touch(run:ManualBackfillSnapshot,started:number){const now=this.clock();run.updatedAt=now.toISOString();run.elapsedMs=Math.max(0,now.getTime()-started);}
  private clock(){return(this.dependencies.now??(()=>new Date()))();}
  private path(){return this.dependencies.databasePath??getDatabasePath();}
}

const KEY=Symbol.for("nearby-jobs.manual-backfill-manager");type Scope=typeof globalThis&{[KEY]?:ManualBackfillManager};
export function getManualBackfillManager(){const scope=globalThis as Scope;return scope[KEY]??=new ManualBackfillManager();}
