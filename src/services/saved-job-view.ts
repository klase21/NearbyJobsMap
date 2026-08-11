import { randomUUID } from "node:crypto";
import type { JobFilterState, SortOption } from "../domain/ui-job";
import { validateJobFilterState } from "../repositories/preferences-repository";

export interface SavedJobView { id:string;name:string;filters:JobFilterState;sort:SortOption;isFavorite:boolean;isDefault:boolean;createdAt:string;updatedAt:string;lastUsedAt:string|null }
export interface SavedJobViewInput { name:string;filters:JobFilterState;sort?:SortOption;isFavorite?:boolean;isDefault?:boolean }
export class SavedJobViewError extends Error { constructor(public code:string,message:string,public status=400){super(message);this.name="SavedJobViewError"} }
export const normalizeViewName=(value:string)=>value.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");
const SORTS=new Set<SortOption>(["newest","deadline","distance","monthly_distance","hourly","daily","monthly","annual","normalized_monthly","company"]);

export function validateSavedJobViewInput(raw:unknown):SavedJobViewInput {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new SavedJobViewError("INVALID_VIEW","저장 보기를 확인해 주세요.");
  const record=raw as Record<string,unknown>;const allowed=new Set(["name","filters","sort","isFavorite","isDefault"]);
  if(Object.keys(record).some(key=>!allowed.has(key)))throw new SavedJobViewError("INVALID_VIEW","허용되지 않은 항목이 있습니다.");
  if(typeof record.name!=="string")throw new SavedJobViewError("INVALID_VIEW_NAME","이름을 입력해 주세요.");
  const name=record.name.normalize("NFKC").trim().replace(/\s+/g," ");
  if(name.length<2||name.length>60||[...name].some(char=>{const code=char.codePointAt(0)??0;return code<32||code===127}))throw new SavedJobViewError("INVALID_VIEW_NAME","이름은 2~60자로 입력해 주세요.");
  if(!validateJobFilterState(record.filters))throw new SavedJobViewError("INVALID_FILTERS","필터 구성이 올바르지 않습니다.");
  const sort=(record.sort??"newest") as SortOption;if(!SORTS.has(sort))throw new SavedJobViewError("INVALID_SORT","정렬 조건이 올바르지 않습니다.");
  if(record.isFavorite!==undefined&&typeof record.isFavorite!=="boolean")throw new SavedJobViewError("INVALID_VIEW","즐겨찾기 값을 확인해 주세요.");
  if(record.isDefault!==undefined&&typeof record.isDefault!=="boolean")throw new SavedJobViewError("INVALID_VIEW","기본 보기 값을 확인해 주세요.");
  return{name,filters:record.filters,sort,isFavorite:record.isFavorite===true,isDefault:record.isDefault===true};
}
export const createSavedViewId=()=>`view_${randomUUID().replaceAll("-","")}`;
