import { NextResponse } from "next/server";
import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../server/collection-control/access";
import { getCollectionRunManager } from "../../../../server/collection-control/collection-run-manager";
import { PROFILE_ID_PATTERN, SavedCollectionProfileRepository } from "../../../../server/collection-profiles/repository";
import { parseProfileUpdateBody } from "../../../../server/collection-profiles/request-validation";

type Context = { params: Promise<{ profileId: string }> };
function id(value: string): string { if (!PROFILE_ID_PATTERN.test(value)) throw Object.assign(new Error("프로필 ID가 올바르지 않습니다."), { code: "PROFILE_ID_INVALID", status: 400 }); return value; }

export async function GET(request: Request, context: Context) {
  try { assertLocalCollectionAccess(request); const profileId = id((await context.params).profileId); const database = openReadonlyDatabase(getDatabasePath());
    try { const profile = new SavedCollectionProfileRepository(database).get(profileId); if (!profile) throw Object.assign(new Error("저장 프로필을 찾을 수 없습니다."), { code: "PROFILE_NOT_FOUND", status: 404 }); return NextResponse.json({ profile }); } finally { database.close(); } }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
}
export async function PATCH(request: Request, context: Context) {
  try { assertLocalCollectionAccess(request); const profileId = id((await context.params).profileId); const parsed = parseProfileUpdateBody(await request.json()); const database = openWritableDatabase(getDatabasePath());
    try { return NextResponse.json({ profile: new SavedCollectionProfileRepository(database).update(profileId, parsed.expectedRevision, parsed.profile) }); } finally { database.close(); } }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
}

export async function DELETE(request: Request, context: Context) {
  try { assertLocalCollectionAccess(request); const profileId = id((await context.params).profileId); const active = getCollectionRunManager().active();
    if (active?.savedProfile?.id === profileId) throw Object.assign(new Error("현재 실행 중인 프로필은 삭제할 수 없습니다."), { code: "PROFILE_ACTIVE_CONFLICT", status: 409 });
    const database = openWritableDatabase(getDatabasePath()); try { new SavedCollectionProfileRepository(database).delete(profileId); return new NextResponse(null, { status: 204 }); } finally { database.close(); } }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
}
