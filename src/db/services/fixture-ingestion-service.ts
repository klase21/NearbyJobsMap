import { getFixtureDrivenJobs } from "../../data/job-provider";
import type { UiJobRecord } from "../../domain/ui-job";
import { IngestionService } from "./ingestion-service";
import type Database from "better-sqlite3";
import type { EvidenceType, IngestionRecord, IngestionResult } from "../schema";

const FIXTURE_PROVENANCE: Record<string, { reference: string; evidenceType: EvidenceType }> = {
  "jobkorea:49711856": { reference: "src/sources/jobkorea/fixtures/listing-seoul-2026-08-05.json", evidenceType: "observed_html" },
  "jobkorea:49678812": { reference: "src/sources/jobkorea/fixtures/listing-seoul-2026-08-05.json", evidenceType: "observed_html" },
  "jobkorea:49715720": { reference: "src/sources/jobkorea/fixtures/listing-seoul-2026-08-05.json + detail-49715720.json", evidenceType: "observed_json_ld" },
  "albamon:118279576": { reference: "src/sources/albamon/fixtures/listing-area-2026-08-05.json", evidenceType: "observed_html" },
  "albamon:118278018": { reference: "src/sources/albamon/fixtures/listing-area-2026-08-05.json", evidenceType: "observed_html" },
  "albamon:118270285": { reference: "src/sources/albamon/fixtures/detail-118270285.json", evidenceType: "observed_json_ld" },
};

export function getFixtureIngestionRecords(records: UiJobRecord[] = getFixtureDrivenJobs()): IngestionRecord[] {
  return records.map((record) => {
    const provenance = FIXTURE_PROVENANCE[record.job.id];
    if (!provenance) throw new Error(`FIXTURE_PROVENANCE_MISSING: ${record.job.id}`);
    return {
      job: record.job,
      metadata: { recordKind: "fixture_derived", evidenceType: provenance.evidenceType, sourceFixtureReference: provenance.reference, mapPosition: record.mapPosition },
    };
  });
}

export function ingestSanitizedFixtures(database: Database.Database): IngestionResult {
  return new IngestionService(database).ingest(getFixtureIngestionRecords(), { source: "mixed", ingestionType: "sanitized_fixture" });
}
