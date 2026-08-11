import "server-only";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertLocalPersonalWorkspaceAccess(request: Request): void {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) throw Object.assign(new Error("개인 구직 정보는 로컬 호스트에서만 사용할 수 있습니다."), { code: "PERSONAL_WORKSPACE_NON_LOCAL_REJECTED", status: 403 });
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded && !LOCAL_HOSTS.has(forwarded)) throw Object.assign(new Error("개인 구직 정보는 로컬 요청에서만 사용할 수 있습니다."), { code: "PERSONAL_WORKSPACE_NON_LOCAL_REJECTED", status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).hostname.toLowerCase(); } catch { /* Invalid origins are rejected below. */ }
    if (!LOCAL_HOSTS.has(originHost)) throw Object.assign(new Error("개인 구직 정보 요청 출처가 로컬이 아닙니다."), { code: "PERSONAL_WORKSPACE_ORIGIN_REJECTED", status: 403 });
  }
}

export function personalWorkspaceError(error: unknown): { code: string; message: string; status: number } {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; status?: unknown };
    return { code: typeof value.code === "string" ? value.code : "PERSONAL_WORKSPACE_FAILED",
      message: typeof value.message === "string" ? value.message.slice(0, 500) : "개인 구직 정보 요청을 처리하지 못했습니다.",
      status: typeof value.status === "number" ? value.status : 500 };
  }
  return { code: "PERSONAL_WORKSPACE_FAILED", message: "개인 구직 정보 요청을 처리하지 못했습니다.", status: 500 };
}
