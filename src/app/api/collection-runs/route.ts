import { NextResponse } from "next/server";
import { assertLocalCollectionAccess, collectionControlError } from "../../../server/collection-control/access";
import { getCollectionRunManager } from "../../../server/collection-control/collection-run-manager";
import { parseCollectionStartBody } from "../../../server/collection-control/request-validation";

export async function POST(request: Request) {
  try {
    assertLocalCollectionAccess(request);
    const run = getCollectionRunManager().start(parseCollectionStartBody(await request.json()));
    return NextResponse.json(run, { status: 202 });
  } catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
}
