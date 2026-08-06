// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileTransferPanel } from "../../components/collection/ProfileTransferPanel";
import type { SavedCollectionProfile } from "../../services/saved-collection-profile";

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const profile:SavedCollectionProfile={id:"123e4567-e89b-42d3-a456-426614174000",name:"서울 AI 저장",source:"jobkorea",basePresetId:"seoul-ai",strategy:"jobkorea_keyword",keyword:"AI",regions:["seoul"],pages:1,maxCandidates:10,allowListingFallback:true,exclusion:{keywords:["강사"],fields:["title"]},isFavorite:true,revision:1,configurationHash:"hash",createdAt:"2026-08-06T00:00:00Z",updatedAt:"2026-08-06T00:00:00Z",lastUsedAt:null};

describe("ProfileTransferPanel",()=>{
 it("renders distinct accessible import and export controls",()=>{render(<ProfileTransferPanel profiles={[profile]} selectedIds={[]} disabled={false} onSelectionChange={vi.fn()} onChanged={vi.fn()}/>);expect(screen.getByRole("button",{name:"프로필 가져오기"})).toBeEnabled();expect(screen.getByRole("button",{name:"선택 내보내기"})).toBeDisabled();expect(screen.getByRole("button",{name:"모두 내보내기"})).toBeEnabled();});
 it("opens a keyboard-accessible file dialog without writing",()=>{render(<ProfileTransferPanel profiles={[]} selectedIds={[]} disabled={false} onSelectionChange={vi.fn()} onChanged={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"프로필 가져오기"}));expect(screen.getByRole("dialog",{name:"프로필 가져오기"})).toBeInTheDocument();expect(screen.getByText("미리보기는 SQLite를 변경하지 않습니다.")).toBeInTheDocument();expect(screen.getByLabelText(/JSON 파일 선택/)).toHaveAttribute("accept","application/json,.json");});
 it("exports explicit selected IDs only after a click",async()=>{const fetchMock=vi.fn(async()=>new Response("{}",{status:200,headers:{"content-type":"application/json","content-disposition":"attachment; filename=profiles.json"}}));vi.stubGlobal("fetch",fetchMock);vi.stubGlobal("URL",{createObjectURL:()=>"blob:test",revokeObjectURL:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});render(<ProfileTransferPanel profiles={[profile]} selectedIds={[profile.id]} disabled={false} onSelectionChange={vi.fn()} onChanged={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"선택 내보내기"}));await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith("/api/collection-profiles/export",expect.objectContaining({method:"POST",body:JSON.stringify({profileIds:[profile.id]})})));});
});
