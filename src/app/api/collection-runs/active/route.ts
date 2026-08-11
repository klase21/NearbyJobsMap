import { NextResponse } from "next/server";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../server/collection-control/access";

export async function GET(request: Request) {
  try { assertLocalCollectionAccess(request); const { getCollectionRunManager } = await import("../../../../server/collection-control/collection-run-manager"); return NextResponse.json({ run: getCollectionRunManager().active() }); }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
}

