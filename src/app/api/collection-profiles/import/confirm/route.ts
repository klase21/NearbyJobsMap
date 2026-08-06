import { NextResponse } from "next/server";
import { getDatabasePath, openWritableDatabase } from "../../../../../db/connection";
import { assertLocalCollectionAccess, collectionControlError } from "../../../../../server/collection-control/access";
import { parseConfirmRequest } from "../../../../../server/collection-profile-transfer/request-validation";
import { confirmProfileImport } from "../../../../../server/collection-profile-transfer/service";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{assertLocalCollectionAccess(request);const input=parseConfirmRequest(await request.json());const db=openWritableDatabase(getDatabasePath());try{return NextResponse.json(confirmProfileImport(db,input.previewToken,input.actions));}finally{db.close();}}catch(error){const safe=collectionControlError(error);return NextResponse.json({error:{code:safe.code,message:safe.message}},{status:safe.status});}}
