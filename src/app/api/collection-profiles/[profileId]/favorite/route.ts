import { NextResponse } from "next/server";
import { getDatabasePath, openWritableDatabase } from "../../../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../../server/collection-control/access";
import { PROFILE_ID_PATTERN, SavedCollectionProfileRepository } from "../../../../../server/collection-profiles/repository";
import { parseFavoriteBody } from "../../../../../server/collection-profiles/request-validation";

type Context = { params: Promise<{ profileId: string }> };
export async function POST(request: Request, context: Context) {
  try { assertLocalCollectionAccess(request); const profileId = (await context.params).profileId;
    if (!PROFILE_ID_PATTERN.test(profileId)) throw Object.assign(new Error("프로필 ID가 올바르지 않습니다."), { code: "PROFILE_ID_INVALID", status: 400 });
    const input = parseFavoriteBody(await request.json()); const database = openWritableDatabase(getDatabasePath());
    try { return NextResponse.json({ profile: new SavedCollectionProfileRepository(database).setFavorite(profileId, input.expectedRevision, input.isFavorite) }); } finally { database.close(); } }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
}
