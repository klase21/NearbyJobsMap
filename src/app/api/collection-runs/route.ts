import { NextResponse } from "next/server";
import { assertLocalCollectionAccess, collectionControlError } from "../../../server/collection-control/access";
import { parseCollectionStartBody } from "../../../server/collection-control/request-validation";

export async function POST(request: Request) {
  try {
    assertLocalCollectionAccess(request);
    const { getCollectionRunManager } = await import("../../../server/collection-control/collection-run-manager");
    const run = getCollectionRunManager().start(parseCollectionStartBody(await request.json()));
    return NextResponse.json(run, { status: 202 });
  } catch (error) { const safe = collectionControlError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
}
