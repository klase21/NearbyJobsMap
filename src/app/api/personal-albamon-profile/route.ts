import { NextResponse } from "next/server";
import { assertLocalPersonalWorkspaceAccess, personalWorkspaceError } from "../../../server/personal-workspace/access";
import { getPersonalAlbamonProfile, savePersonalAlbamonProfile } from "../../../server/personal-albamon-profile/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const failure = (error: unknown) => {
  const safe = personalWorkspaceError(error);
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
};

export async function GET(request: Request) {
  try { assertLocalPersonalWorkspaceAccess(request); return NextResponse.json(getPersonalAlbamonProfile()); }
  catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    assertLocalPersonalWorkspaceAccess(request);
    const body: unknown = await request.json();
    return NextResponse.json(savePersonalAlbamonProfile(body));
  } catch (error) { return failure(error); }
}
