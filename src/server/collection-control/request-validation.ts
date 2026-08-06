import type { CollectionControlConfig, CollectionControlMode } from "./contracts";

export interface CollectionStartInput extends CollectionControlConfig { mode: CollectionControlMode; writeAuthorizationToken?: string; confirmationPhrase?: string }
const ALLOWED_FIELDS = new Set(["presetId", "pages", "maxDetails", "mode", "writeAuthorizationToken", "confirmationPhrase"]);

export function parseCollectionStartBody(body: unknown): CollectionStartInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("요청 본문이 올바르지 않습니다."), { code: "COLLECTION_REQUEST_INVALID", status: 400 });
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_FIELDS.has(key))) throw Object.assign(new Error("허용되지 않은 실행 필드가 포함되어 있습니다."), { code: "COLLECTION_REQUEST_FIELD_REJECTED", status: 400 });
  if (typeof record.presetId !== "string" || typeof record.pages !== "number" || typeof record.maxDetails !== "number" || (record.mode !== "dry_run" && record.mode !== "write")) {
    throw Object.assign(new Error("프리셋, 페이지, 후보 수, 실행 모드가 필요합니다."), { code: "COLLECTION_REQUEST_INVALID", status: 400 });
  }
  return { presetId: record.presetId as CollectionControlConfig["presetId"], pages: record.pages, maxDetails: record.maxDetails, mode: record.mode,
    ...(typeof record.writeAuthorizationToken === "string" ? { writeAuthorizationToken: record.writeAuthorizationToken } : {}),
    ...(typeof record.confirmationPhrase === "string" ? { confirmationPhrase: record.confirmationPhrase } : {}) };
}

