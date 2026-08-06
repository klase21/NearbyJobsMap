import { NextResponse } from "next/server";
import { getDatabasePath, openWritableDatabase } from "../../../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../../server/collection-control/access";
import { PROFILE_ID_PATTERN, SavedCollectionProfileRepository } from "../../../../../server/collection-profiles/repository";

type Context = { params: Promise<{ profileId: string }> };
export async function POST(request: Request, context: Context) {
  try { assertLocalCollectionAccess(request); const profileId = (await context.params).profileId;
    if (!PROFILE_ID_PATTERN.test(profileId)) throw Object.assign(new Error("프로필 ID가 올바르지 않습니다."), { code: "PROFILE_ID_INVALID", status: 400 });
    const body: unknown = await request.json().catch(() => ({})); if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw Object.assign(new Error("복제 요청에는 추가 필드를 사용할 수 없습니다."), { code: "PROFILE_REQUEST_FIELD_REJECTED", status: 400 });
    const database = openWritableDatabase(getDatabasePath()); try { return NextResponse.json({ profile: new SavedCollectionProfileRepository(database).duplicate(profileId) }, { status: 201 }); } finally { database.close(); } }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
}
