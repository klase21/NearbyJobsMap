import { NextResponse } from "next/server";
import { getDatabasePath, openReadonlyDatabase } from "../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../server/collection-control/access";
import { SavedProfileComparisonRepository } from "../../../server/collection-profile-comparison/repository";
import { parseProfileComparisonRequest } from "../../../server/collection-profile-comparison/request-validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertLocalCollectionAccess(request);
    const input = parseProfileComparisonRequest(await request.json());
    const database = openReadonlyDatabase(getDatabasePath());
    try { return NextResponse.json({ comparison: new SavedProfileComparisonRepository(database).compare(input) }); }
    finally { database.close(); }
  } catch (error) {
    const safe = collectionControlError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
