// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalHelpPanel } from "../../components/help/LocalHelpPanel";

describe("local help and readiness panel",()=>{
  it("shows safe readiness labels and external support links",()=>{render(<LocalHelpPanel readiness={{version:"0.1.1",databaseReady:true,migrationsReady:true,chromiumReady:false,collectionUiEnabled:false,localhostSafe:true,latestBackupAvailable:false}}/>);expect(screen.getByText("데이터베이스 준비 완료")).toBeInTheDocument();expect(screen.getByText("브라우저 수집 기능 설치 필요")).toBeInTheDocument();expect(screen.getByText("수집 관리 비활성화")).toBeInTheDocument();const issue=screen.getByRole("link",{name:"GitHub에서 문제 신고"});expect(issue).toHaveAttribute("href","https://github.com/klase21/NearbyJobsMap/issues/new/choose");expect(issue).toHaveAttribute("target","_blank");expect(issue).toHaveAttribute("rel","noopener noreferrer");expect(screen.getByText(/런타임 DB/)).toBeInTheDocument()});
});
