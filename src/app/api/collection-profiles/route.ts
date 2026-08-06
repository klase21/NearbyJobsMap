import { NextResponse } from "next/server";
import { getDatabasePath, openReadonlyDatabase, openWritableDatabase } from "../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../server/collection-control/access";
import { SavedCollectionProfileRepository } from "../../../server/collection-profiles/repository";
import { parseProfileCreateBody } from "../../../server/collection-profiles/request-validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { assertLocalCollectionAccess(request); const database = openReadonlyDatabase(getDatabasePath());
    try { return NextResponse.json({ profiles: new SavedCollectionProfileRepository(database).list() }); } finally { database.close(); } }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
}
export async function POST(request: Request) {
  try { assertLocalCollectionAccess(request); const input = parseProfileCreateBody(await request.json()); const database = openWritableDatabase(getDatabasePath());
    try { return NextResponse.json({ profile: new SavedCollectionProfileRepository(database).create(input) }, { status: 201 }); } finally { database.close(); } }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
}
