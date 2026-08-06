import { NextResponse } from "next/server";
import { getDatabasePath, openReadonlyDatabase } from "../../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../server/collection-control/access";
import { listRecentCollectionRuns } from "../../../../server/collection-control/recent-runs";

export async function GET(request: Request) {
  try {
    assertLocalCollectionAccess(request); const database = openReadonlyDatabase(getDatabasePath());
    try { return NextResponse.json({ runs: listRecentCollectionRuns(database) }); } finally { database.close(); }
  } catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
}

