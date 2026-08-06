import "server-only";
import type Database from "better-sqlite3";
import { normalizeProfileName, profileError, type SavedCollectionProfileInput } from "../../services/saved-collection-profile";
import { SavedCollectionProfileRepository } from "../collection-profiles/repository";
import { getCollectionRunManager } from "../collection-control/collection-run-manager";
import { previewImportedProfile } from "./parser";
import { getProfileImportPreviewManager, type ProfileImportPreviewManager } from "./preview-manager";
import type { ImportConfirmAction, ImportConfirmResult, ImportPreviewResult } from "./contracts";

export function createImportPreview(database:Database.Database, rawProfiles:Record<string,unknown>[], metadata:{filename:string;fileSize:number;payloadHash:string}, manager=getProfileImportPreviewManager()):ImportPreviewResult{
 const existing=new SavedCollectionProfileRepository(database).list(); const profiles=rawProfiles.map((raw,index)=>previewImportedProfile(raw,index,existing));
 return manager.create({format:"nearby-jobs-collection-profiles",version:1,filename:metadata.filename.slice(0,255),fileSize:metadata.fileSize,profileCount:profiles.length,profiles},metadata.payloadHash);
}

function withName(input:SavedCollectionProfileInput,name:string):SavedCollectionProfileInput{return{...input,name};}
export function confirmProfileImport(database:Database.Database,token:string,actions:ImportConfirmAction[],manager:ProfileImportPreviewManager=getProfileImportPreviewManager()):ImportConfirmResult{
 const preview=manager.require(token); const actionMap=new Map(actions.map(action=>[action.exportKey,action])); const selected=actions.filter(action=>action.action!=="skip");
 const result=database.transaction(()=>{const repo=new SavedCollectionProfileRepository(database);const imported=[];let created=0,replaced=0,unchanged=0,skipped=0;
   for(const entry of preview.result.profiles){const action=actionMap.get(entry.exportKey)??{exportKey:entry.exportKey,action:"skip" as const};if(action.action==="skip"){skipped++;continue;}if(!entry.configurationValid||!entry.configuration||!entry.availableActions.includes(action.action))throw profileError("PROFILE_IMPORT_ACTION_NOT_ALLOWED",`'${entry.importedName}' 프로필에 선택한 작업을 적용할 수 없습니다.`);
     if(action.action==="create"||action.action==="rename_and_create"){const input=action.action==="rename_and_create"?withName(entry.configuration,action.newName??""):entry.configuration; imported.push(repo.create(input));created++;continue;}
     const conflict=entry.conflictingProfile;if(!conflict||action.expectedRevision!==conflict.revision||!action.replaceConfirmed)throw profileError("PROFILE_IMPORT_REPLACE_CONFIRMATION_REQUIRED","기존 프로필 교체에는 미리보기 revision과 명시적 확인이 필요합니다.",409);
     const active=getCollectionRunManager().active();if(active?.savedProfile?.id===conflict.id)throw profileError("PROFILE_ACTIVE_CONFLICT","실행 중인 프로필은 가져오기로 바꿀 수 없습니다.",409);
     const current=repo.require(conflict.id);if(current.revision!==conflict.revision)throw profileError("PROFILE_REVISION_CONFLICT","기존 프로필이 미리보기 이후 변경되었습니다.",409);
     const importedName=normalizeProfileName(entry.configuration.name).normalizedName; if(normalizeProfileName(current.name).normalizedName!==importedName)throw profileError("PROFILE_IMPORT_CONFLICT_CHANGED","이름 충돌 대상이 변경되었습니다.",409);
     if(current.configurationHash===entry.computedConfigurationHash){if(current.isFavorite!==Boolean(entry.configuration.isFavorite)) imported.push(repo.setFavorite(current.id,current.revision,Boolean(entry.configuration.isFavorite)));else{imported.push(current);unchanged++;continue;}unchanged++;continue;}
     let updated=repo.update(current.id,current.revision,entry.configuration);if(updated.isFavorite!==Boolean(entry.configuration.isFavorite))updated=repo.setFavorite(updated.id,updated.revision,Boolean(entry.configuration.isFavorite));imported.push(updated);replaced++;
   }
   return{created,replaced,unchanged,skipped,invalidNotSelected:preview.result.profiles.filter(p=>!p.configurationValid&&(actionMap.get(p.exportKey)?.action??"skip")==="skip").length,totalSelected:selected.length,profiles:imported};
 })(); manager.consume(token); return result;
}
