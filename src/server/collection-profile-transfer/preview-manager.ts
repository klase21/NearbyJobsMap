import "server-only";
import { randomUUID } from "node:crypto";
import { profileError } from "../../services/saved-collection-profile";
import type { ImportPreviewResult } from "./contracts";

export interface StoredImportPreview { result: ImportPreviewResult; payloadHash: string; createdAt: number; used: boolean }
const GLOBAL_KEY = Symbol.for("nearby-jobs.profile-import-preview-manager");

export class ProfileImportPreviewManager {
  private readonly previews = new Map<string, StoredImportPreview>();
  constructor(private readonly now:()=>number=()=>Date.now(), private readonly ttlMs=15*60_000, private readonly maximum=5) {}
  create(value: Omit<ImportPreviewResult,"previewToken"|"expiresAt">, payloadHash:string): ImportPreviewResult {
    this.cleanup(); if(this.previews.size>=this.maximum) throw profileError("PROFILE_IMPORT_PREVIEW_CAPACITY","활성 가져오기 미리보기는 최대 5개입니다.",429);
    const previewToken=randomUUID(); const expiresAt=new Date(this.now()+this.ttlMs).toISOString();
    const result={...value,previewToken,expiresAt}; this.previews.set(previewToken,{result,payloadHash,createdAt:this.now(),used:false}); return result;
  }
  require(token:string):StoredImportPreview { this.cleanup(); const preview=this.previews.get(token); if(!preview) throw profileError("PROFILE_IMPORT_PREVIEW_NOT_FOUND","가져오기 미리보기를 찾을 수 없습니다. 서버가 재시작되었거나 만료되었을 수 있습니다.",404); if(preview.used) throw profileError("PROFILE_IMPORT_PREVIEW_USED","이미 사용한 가져오기 미리보기입니다.",409); return preview; }
  consume(token:string):void { const preview=this.require(token); preview.used=true; }
  cleanup():void { const now=this.now(); for(const [token,preview] of this.previews) if(Date.parse(preview.result.expiresAt)<=now||preview.used)this.previews.delete(token); }
  clear():void { this.previews.clear(); }
}

type GlobalWithPreview=typeof globalThis & {[GLOBAL_KEY]?:ProfileImportPreviewManager};
export function getProfileImportPreviewManager():ProfileImportPreviewManager { const scope=globalThis as GlobalWithPreview; return scope[GLOBAL_KEY]??=new ProfileImportPreviewManager(); }
