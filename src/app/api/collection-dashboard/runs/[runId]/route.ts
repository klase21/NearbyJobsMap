import { NextResponse } from "next/server";
import { getDatabasePath, openReadonlyDatabase } from "../../../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../../server/collection-control/access";
import { assertDashboardRunId } from "../../../../../server/collection-dashboard/filters";
import { CollectionDashboardRepository } from "../../../../../server/collection-dashboard/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    assertLocalCollectionAccess(request);
    const runId = assertDashboardRunId((await context.params).runId);
    const database = openReadonlyDatabase(getDatabasePath());
    try {
      const run = new CollectionDashboardRepository(database).getRunDetail(runId);
      if (!run) return NextResponse.json({ error: { code: "COLLECTION_DASHBOARD_RUN_NOT_FOUND", message: "수집 실행 기록을 찾을 수 없습니다." } }, { status: 404 });
      return NextResponse.json({ run });
    } finally { database.close(); }
  } catch (error) {
    const safe = collectionControlError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
