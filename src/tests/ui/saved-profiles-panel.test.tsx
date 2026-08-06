// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { SavedProfilesPanel } from "../../components/collection/SavedProfilesPanel";
import { COLLECTION_PRESETS } from "../../sources/collection/collection-presets";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const preset=COLLECTION_PRESETS["capital-ai"]!;
const profile:SavedCollectionProfile={id:"123e4567-e89b-42d3-a456-426614174000",name:"즐겨찾는 서울 AI",source:"jobkorea",basePresetId:"capital-ai",strategy:"jobkorea_keyword",keyword:"AI",regions:["seoul","gyeonggi"],pages:2,maxCandidates:20,allowListingFallback:true,exclusion:{keywords:["강사"],fields:["title"]},isFavorite:true,revision:2,configurationHash:"abc",createdAt:"2026-08-06T00:00:00Z",updatedAt:"2026-08-06T00:00:00Z",lastUsedAt:null};
const props={enabled:true,busy:false,presets:Object.values(COLLECTION_PRESETS),seed:{preset,pages:2,maxCandidates:20,exclusion:{keywords:["전기"],fields:["title" as const]}},selectedProfileId:null};

describe("SavedProfilesPanel",()=>{
 it("renders persisted cards, favorite metadata, filters, and selection",async()=>{const onSelect=vi.fn();vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({profiles:[profile]}),{status:200})));render(<SavedProfilesPanel {...props} onSelect={onSelect}/>);expect(await screen.findByText("즐겨찾는 서울 AI")).toBeInTheDocument();expect(screen.getByLabelText(/즐겨찾기 해제/)).toHaveAttribute("aria-pressed","true");fireEvent.click(screen.getByRole("button",{name:"선택"}));expect(onSelect).toHaveBeenCalledWith(profile);fireEvent.change(screen.getByLabelText("소스"),{target:{value:"albamon"}});expect(screen.getByText("조건에 맞는 저장 프로필이 없습니다.")).toBeInTheDocument();});
 it("creates from the current preset with accessible bounded fields",async()=>{vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==="POST")return new Response(JSON.stringify({profile}),{status:201});return new Response(JSON.stringify({profiles:[]}),{status:200});}));render(<SavedProfilesPanel {...props} onSelect={vi.fn()}/>);await screen.findByText(/저장된 프로필이 없습니다/);fireEvent.click(screen.getByRole("button",{name:"현재 설정을 프로필로 저장"}));expect(screen.getByRole("dialog")).toBeInTheDocument();expect(screen.getByLabelText("페이지")).toHaveAttribute("max","5");expect(screen.getByLabelText("최대 후보")).toHaveAttribute("max","50");fireEvent.change(screen.getByLabelText("프로필 이름"),{target:{value:"테스트 프로필"}});fireEvent.click(screen.getByRole("button",{name:"저장"}));await waitFor(()=>expect(fetch).toHaveBeenCalledWith("/api/collection-profiles",expect.objectContaining({method:"POST"})));});
});
