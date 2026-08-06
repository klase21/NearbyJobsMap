"use client";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
export const ONBOARDING_STORAGE_KEY="nearby-jobs-onboarding-v1";
const STEPS=[
 {title:"로컬에서 시작하는 일자리 탐색",body:"공고는 이 컴퓨터의 SQLite에 저장됩니다. 목록이 주 화면이고 지도는 위치를 살펴보는 보조 도구이며, 클라우드 계정은 필요하지 않습니다."},
 {title:"데이터 표기를 먼저 확인하세요",body:"데모와 픽스처는 제품 예시입니다. 수동 수집은 사용자가 실행한 자료이며, 목록 정보와 상세 확인은 데이터 완성도를 구분합니다."},
 {title:"안전한 수동 수집",body:"수집 관리에서 preset 또는 프로필을 고르고 드라이런 결과를 검토한 뒤, 정확한 확인 문구로만 SQLite write를 실행합니다."},
 {title:"지역과 제외 키워드",body:"서울·경기는 목록 위치를 로컬에서 정규화합니다. 위치가 모호하면 추측하지 않으며, 제외 키워드는 후보 한도보다 먼저 적용됩니다."},
 {title:"나만의 지원 워크플로",body:"관심, 지원 예정, 지원 완료, 면접과 결과 상태를 관리하고 개인 메모와 후속 일정을 source 데이터와 분리해 기록할 수 있습니다."},
 {title:"준비되었습니다",body:"공고를 둘러보거나 수집 관리로 이동해 프로필을 만들 수 있습니다."},
] as const;
export function onboardingCompleted(storage:Pick<Storage,"getItem">|null):boolean{if(!storage)return true;try{return storage.getItem(ONBOARDING_STORAGE_KEY)==="completed"||storage.getItem(ONBOARDING_STORAGE_KEY)==="dismissed";}catch{return true;}}
export function FirstRunOnboarding({forceOpen=false,onClose}:{forceOpen?:boolean;onClose?():void}){const [open,setOpen]=useState(forceOpen);const [step,setStep]=useState(0);const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(forceOpen){setOpen(true);setStep(0);return;}setOpen(!onboardingCompleted(window.localStorage));},[forceOpen]);
 useEffect(()=>{if(open)ref.current?.querySelector<HTMLElement>("button,a")?.focus();},[open,step]);
 const finish=(value:"completed"|"dismissed")=>{try{window.localStorage.setItem(ONBOARDING_STORAGE_KEY,value);}catch{}setOpen(false);onClose?.();};
 const key=(e:React.KeyboardEvent)=>{if(e.key==="Escape")finish("dismissed");if(e.key!=="Tab"||!ref.current)return;const items=[...ref.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]")];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};
 if(!open)return null;const current=STEPS[step]!;return <div className="onboarding-backdrop"><section ref={ref} className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onKeyDown={key}><div className="onboarding-progress" aria-label={`온보딩 ${step+1}/${STEPS.length}`}><progress max={STEPS.length} value={step+1}/><span>{step+1} / {STEPS.length}</span></div><h2 id="onboarding-title">{current.title}</h2><p>{current.body}</p>{step===1&&<div className="onboarding-labels"><span>데모</span><span>픽스처</span><span>수동 수집</span><span>목록 정보</span><span>상세 확인</span></div>}{step===3&&<p className="safe-notice">예: 서울·경기만 선택하고 강사·웨이터 같은 키워드를 제외할 수 있습니다.</p>}<div className="onboarding-actions">{step>0&&<button className="button soft" onClick={()=>setStep(step-1)}>이전</button>}{step<STEPS.length-1?<button className="button primary" onClick={()=>setStep(step+1)}>{step===0?"시작하기":"다음"}</button>:<><button className="button primary" onClick={()=>finish("completed")}>공고 둘러보기</button><Link className="button soft" href="/collection" onClick={()=>finish("completed")}>수집 관리로 이동</Link></>}<button className="button" onClick={()=>finish("dismissed")}>{step===0?"건너뛰기":"다시 보지 않기"}</button></div></section></div>}
