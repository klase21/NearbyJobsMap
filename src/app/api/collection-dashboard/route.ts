import { NextResponse } from "next/server";
import { getDatabasePath, openReadonlyDatabase } from "../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../server/collection-control/access";
import { parseDashboardFilters } from "../../../server/collection-dashboard/filters";
import { CollectionDashboardRepository } from "../../../server/collection-dashboard/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalCollectionAccess(request);
    const filters = parseDashboardFilters(new URL(request.url));
    const database = openReadonlyDatabase(getDatabasePath());
    try { return NextResponse.json({ dashboard: new CollectionDashboardRepository(database).getDashboard(filters) }); }
    finally { database.close(); }
  } catch (error) {
    const safe = collectionControlError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
