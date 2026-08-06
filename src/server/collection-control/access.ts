import "server-only";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function collectionUiFeatureEnabled(environment: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return environment.NEARBY_JOBS_ENABLE_COLLECTION_UI === "1";
}

export function assertLocalCollectionAccess(request: Request, environment: Partial<NodeJS.ProcessEnv> = process.env): void {
  if (!collectionUiFeatureEnabled(environment)) throw Object.assign(new Error("수집 관리 기능이 비활성화되어 있습니다."), { code: "COLLECTION_UI_DISABLED", status: 403 });
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) throw Object.assign(new Error("수집 실행은 로컬 호스트에서만 허용됩니다."), { code: "COLLECTION_NON_LOCAL_REJECTED", status: 403 });
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded && !LOCAL_HOSTS.has(forwarded)) throw Object.assign(new Error("수집 실행은 로컬 요청에만 허용됩니다."), { code: "COLLECTION_NON_LOCAL_REJECTED", status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = ""; try { originHost = new URL(origin).hostname.toLowerCase(); } catch { /* Invalid origins are rejected below. */ }
    if (!LOCAL_HOSTS.has(originHost)) throw Object.assign(new Error("수집 실행 출처가 로컬이 아닙니다."), { code: "COLLECTION_ORIGIN_REJECTED", status: 403 });
  }
}

export function collectionControlError(error: unknown): { code: string; message: string; status: number } {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; status?: unknown };
    return { code: typeof value.code === "string" ? value.code : "COLLECTION_CONTROL_FAILED",
      message: typeof value.message === "string" ? value.message.slice(0, 500) : "수집 관리 요청을 처리하지 못했습니다.",
      status: typeof value.status === "number" ? value.status : 500 };
  }
  return { code: "COLLECTION_CONTROL_FAILED", message: "수집 관리 요청을 처리하지 못했습니다.", status: 500 };
}
