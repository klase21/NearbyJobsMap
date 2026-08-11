import { NextResponse } from "next/server";
import { assertLocalCollectionAccess, collectionControlError } from "../../../server/collection-control/access";
import { getManualBackfillManager } from "../../../server/manual-backfill/manager";
import { resolveBackfillCutoff, validateBackfillConfig } from "../../../server/manual-backfill/validation";

export async function POST(request:Request){
  try{assertLocalCollectionAccess(request);const body=await request.json() as Record<string,unknown>;
    const scope=body.source==="albamon"?"albamon_personal_all":"date_cutoff";
    const cutoffDate=scope==="date_cutoff"?resolveBackfillCutoff({days:body.days,since:body.since}):null;
    const config=validateBackfillConfig({source:body.source,scope,cutoffDate,maxPages:body.maxPages,exclusion:body.exclusion});
    const mode=body.mode;if(mode!=="dry_run"&&mode!=="write")throw Object.assign(new Error("백필 모드가 올바르지 않습니다."),{code:"BACKFILL_MODE_INVALID",status:400});
    const run=getManualBackfillManager().start({...config,mode,
      ...(typeof body.writeAuthorizationToken==="string"?{writeAuthorizationToken:body.writeAuthorizationToken}:{}),
      ...(typeof body.confirmationPhrase==="string"?{confirmationPhrase:body.confirmationPhrase}:{})});
    return NextResponse.json({run},{status:202});
  }catch(error){const safe=collectionControlError(error);return NextResponse.json({error:safe},{status:safe.status});}
}
