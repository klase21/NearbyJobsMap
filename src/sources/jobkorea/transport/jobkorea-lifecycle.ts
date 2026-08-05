export type JobKoreaLifecycleStatus = "completed" | "timeout" | "failed";
export const JOBKOREA_PAGE1_COMMAND_BUDGET_MS = 40_000;

export interface JobKoreaLifecycleDiagnostic {
  phase: string;
  status: JobKoreaLifecycleStatus;
  elapsedMs: number;
  code: string | null;
  message: string | null;
}

export class JobKoreaLifecycleTimeoutError extends Error {
  constructor(readonly phase: string, readonly timeoutMs: number) {
    super(`${phase} 단계가 ${timeoutMs}ms 내부 제한을 초과했습니다.`);
    this.name = "JobKoreaLifecycleTimeoutError";
  }
}

export async function runBoundedLifecyclePhase<T>(
  phase: string,
  timeoutMs: number,
  operation: () => Promise<T>,
  diagnostics: JobKoreaLifecycleDiagnostic[],
): Promise<T> {
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new JobKoreaLifecycleTimeoutError(phase, timeoutMs)), timeoutMs);
      }),
    ]);
    diagnostics.push({ phase, status: "completed", elapsedMs: Math.round(performance.now() - startedAt), code: null, message: null });
    return result;
  } catch (error) {
    const timeout = error instanceof JobKoreaLifecycleTimeoutError;
    const specificCode = !timeout && error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code : null;
    const message = error instanceof Error
      ? error.message.split(/\r?\n/, 1)[0]!.slice(0, 500)
      : "알 수 없는 lifecycle 실패";
    diagnostics.push({
      phase,
      status: timeout ? "timeout" : "failed",
      elapsedMs: Math.round(performance.now() - startedAt),
      code: timeout ? "JOBKOREA_LIFECYCLE_PHASE_TIMEOUT" : specificCode ?? "JOBKOREA_LIFECYCLE_PHASE_FAILED",
      message,
    });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
