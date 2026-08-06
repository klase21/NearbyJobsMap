import { NextResponse } from "next/server";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../server/collection-control/access";
import { getCollectionRunManager } from "../../../../server/collection-control/collection-run-manager";

export async function GET(request: Request) {
  try { assertLocalCollectionAccess(request); return NextResponse.json({ run: getCollectionRunManager().active() }); }
  catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
}

