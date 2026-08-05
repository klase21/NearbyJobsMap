import albamonDetailFixture from "../sources/albamon/fixtures/detail-118270285.json";
import albamonListingFixture from "../sources/albamon/fixtures/listing-area-2026-08-05.json";
import jobKoreaDetailFixture from "../sources/jobkorea/fixtures/detail-49715720.json";
import jobKoreaListingFixture from "../sources/jobkorea/fixtures/listing-seoul-2026-08-05.json";
import { parseAlbamonDetail } from "../sources/albamon/detail-parser";
import { parseAlbamonListing } from "../sources/albamon/listing-parser";
import { normalizeAlbamon } from "../sources/albamon/normalize";
import type { AlbamonDetailFixture, AlbamonListing, AlbamonListingFixture } from "../sources/albamon/types";
import { parseJobKoreaDetail } from "../sources/jobkorea/detail-parser";
import { parseJobKoreaListing } from "../sources/jobkorea/listing-parser";
import { normalizeJobKorea } from "../sources/jobkorea/normalize";
import type { JobKoreaDetailFixture, JobKoreaListingFixture } from "../sources/jobkorea/types";
import type { ActiveJobSource, UiJobRecord } from "../domain/ui-job";
import { getSafeSourceUrl } from "../services/external-url";
import { DEMO_JOBS } from "./demo-jobs";

function fixtureRecord(job: ReturnType<typeof normalizeJobKorea> | ReturnType<typeof normalizeAlbamon>): UiJobRecord {
  const source = job.source as ActiveJobSource;
  return {
    job, isFictional: false, safeSourceUrl: getSafeSourceUrl(source, job.canonicalUrl ?? job.sourceUrl),
    mapPosition: job.latitude !== null && job.longitude !== null
      ? { latitude: job.latitude, longitude: job.longitude, kind: "exact", provenance: "source" }
      : null,
  };
}

export function getFixtureDrivenJobs(): UiJobRecord[] {
  const jobKoreaPage = parseJobKoreaListing(jobKoreaListingFixture as JobKoreaListingFixture);
  const jobKoreaDetail = parseJobKoreaDetail(jobKoreaDetailFixture as JobKoreaDetailFixture).value ?? undefined;
  const jobKoreaJobs = jobKoreaPage.items.flatMap(({ value }) => value ? [fixtureRecord(normalizeJobKorea(value, value.sourcePostingId === jobKoreaDetail?.sourcePostingId ? jobKoreaDetail : undefined))] : []);

  const albamonPage = parseAlbamonListing(albamonListingFixture as AlbamonListingFixture);
  const albamonJobs = albamonPage.items.flatMap(({ value }) => value ? [fixtureRecord(normalizeAlbamon(value))] : []);
  const albamonDetail = parseAlbamonDetail(albamonDetailFixture as AlbamonDetailFixture).value;
  if (albamonDetail?.sourcePostingId && albamonDetail.title && albamonDetail.companyName) {
    const bridge: AlbamonListing = {
      sourcePostingId: albamonDetail.sourcePostingId, sourceUrl: albamonDetail.canonicalUrl,
      title: albamonDetail.title, companyName: albamonDetail.companyName,
      salaryText: albamonDetail.salaryText, regionText: albamonDetail.addressOriginalText,
      workDaysText: albamonDetail.workDaysOriginalText, workHoursText: null,
      employmentTypes: albamonDetail.employmentType ? [albamonDetail.employmentType] : [], deadlineText: albamonDetail.expiresAt,
      promoted: null, capturedAt: albamonDetail.capturedAt,
    };
    albamonJobs.push(fixtureRecord(normalizeAlbamon(bridge, albamonDetail)));
  }
  return [...jobKoreaJobs, ...albamonJobs];
}

export function getUiJobs(): UiJobRecord[] {
  return [...getFixtureDrivenJobs(), ...DEMO_JOBS];
}
