import { describe, expect, it } from "vitest";
import {
  JOBKOREA_PAGE1_COMMAND_BUDGET_MS,
  JobKoreaLifecycleTimeoutError,
  runBoundedLifecyclePhase,
  type JobKoreaLifecycleDiagnostic,
} from "../../sources/jobkorea/transport/jobkorea-lifecycle";

describe("잡코리아 Playwright lifecycle deadline", () => {
  it("완료 단계의 이름과 시간을 구조화해 기록한다", async () => {
    const diagnostics: JobKoreaLifecycleDiagnostic[] = [];
    await expect(runBoundedLifecyclePhase("synthetic-complete", 100, async () => "ok", diagnostics)).resolves.toBe("ok");
    expect(diagnostics).toEqual([{ phase: "synthetic-complete", status: "completed", elapsedMs: expect.any(Number), code: null, message: null }]);
  });

  it("멈춘 단계가 내부 제한을 넘으면 timeout 진단과 함께 반환 제어를 회수한다", async () => {
    const diagnostics: JobKoreaLifecycleDiagnostic[] = [];
    const never = () => new Promise<never>(() => undefined);
    await expect(runBoundedLifecyclePhase("synthetic-hang", 10, never, diagnostics)).rejects.toBeInstanceOf(JobKoreaLifecycleTimeoutError);
    expect(diagnostics).toEqual([{ phase: "synthetic-hang", status: "timeout", elapsedMs: expect.any(Number), code: "JOBKOREA_LIFECYCLE_PHASE_TIMEOUT", message: expect.stringContaining("synthetic-hang") }]);
  });

  it("page-1 listing 전용 전체 내부 예산은 outer 60초보다 작다", () => {
    expect(JOBKOREA_PAGE1_COMMAND_BUDGET_MS).toBe(40_000);
    expect(JOBKOREA_PAGE1_COMMAND_BUDGET_MS).toBeLessThan(60_000);
  });

  it("구조화 오류 code를 보존하고 외부 stack 줄은 출력하지 않는다", async () => {
    const diagnostics: JobKoreaLifecycleDiagnostic[] = [];
    const error = Object.assign(new Error("snapshot failed\n    at browser-native-code"), {
      code: "JOBKOREA_SNAPSHOT_VALIDATION_FAILED",
    });
    await expect(runBoundedLifecyclePhase("page-1-snapshot", 100, async () => { throw error; }, diagnostics)).rejects.toBe(error);
    expect(diagnostics[0]).toMatchObject({
      phase: "page-1-snapshot",
      code: "JOBKOREA_SNAPSHOT_VALIDATION_FAILED",
      message: "snapshot failed",
    });
  });
});
