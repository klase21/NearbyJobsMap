"use client";
import{useCallback,useEffect,useState}from"react";
import type{JobFilterState,SortOption}from"../../domain/ui-job";
import type{SavedJobView}from"../../services/saved-job-view";

export function SavedViewsBar({filters,sort,onApply}:{filters:JobFilterState;sort?:SortOption;onApply:(filters:JobFilterState,sort?:SortOption)=>void}){
  const[views,setViews]=useState<SavedJobView[]>([]),[name,setName]=useState(""),[message,setMessage]=useState("");
  const load=useCallback(()=>{void fetch("/api/saved-job-views",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("SAVED_VIEWS_LOAD_FAILED");return(await r.json()).views as SavedJobView[]}).then(loaded=>{setViews(loaded);setMessage("")}).catch(()=>setMessage("저장 보기를 불러오지 못했습니다."));},[]);
  useEffect(load,[load]);
  const create=async()=>{const r=await fetch("/api/saved-job-views",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,filters,sort:sort??"newest",isFavorite:false,isDefault:false})});if(r.ok){setName("");setMessage("현재 필터와 정렬을 저장했습니다.");load()}else setMessage("저장하지 못했습니다.")};
  const remove=async(id:string)=>{if(!window.confirm("이 저장 보기를 삭제할까요?"))return;const r=await fetch(`/api/saved-job-views/${id}`,{method:"DELETE"});if(r.ok){setMessage("저장 보기를 삭제했습니다.");load()}else setMessage("삭제하지 못했습니다.")};
  const apply=(view:SavedJobView)=>{if(sort===undefined)onApply(view.filters);else onApply(view.filters,view.sort);setMessage(`${view.name} 보기를 적용했습니다.`)};
  return <section className="saved-views-bar" aria-labelledby="saved-views-title"><h2 id="saved-views-title">저장된 보기</h2><div className="saved-view-controls"><label>보기 선택<select defaultValue="" onChange={e=>{const view=views.find(v=>v.id===e.target.value);if(view)apply(view)}}><option value="">전체 공고</option>{views.map(v=><option key={v.id} value={v.id}>{v.isFavorite?"★ ":""}{v.name}</option>)}</select></label><label>현재 필터 이름<input value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="예: 월급+거리 알바몬"/></label><button type="button" disabled={name.trim().length<2} onClick={()=>void create()}>현재 필터 저장</button></div>{views.length>0&&<div className="saved-view-chips">{views.map(v=><span key={v.id}><button type="button" onClick={()=>apply(v)}>{v.isFavorite?"★ ":""}{v.name}</button><button type="button" aria-label={`${v.name} 삭제`} onClick={()=>void remove(v.id)}>×</button></span>)}</div>}<p aria-live="polite">{message}</p></section>;
}
