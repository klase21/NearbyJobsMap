import { NextResponse } from "next/server";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../server/collection-control/access";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    assertLocalCollectionAccess(request); const { getCollectionRunManager } = await import("../../../../server/collection-control/collection-run-manager"); const { runId } = await context.params; const run = getCollectionRunManager().get(runId);
    if (!run) return NextResponse.json({ error: { code: "COLLECTION_RUN_NOT_FOUND", message: "실행 상태를 찾을 수 없습니다. 서버가 재시작되었을 수 있습니다.", status: 404 } }, { status: 404 });
    return NextResponse.json({ run });
  } catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
}

