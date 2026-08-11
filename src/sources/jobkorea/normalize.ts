import type { CanonicalJob } from "../../domain/canonical-job";
import { classifyLocation } from "../../services/location-classifier";
import { classifyPostingStatus } from "../../services/posting-lifecycle";
import { normalizeSalary } from "../../services/salary-normalizer";
import { parseSalary } from "../../services/salary-parser";
import type { JobKoreaDetail, JobKoreaListing } from "./types";

function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function normalizeCompany(value: string): string {
  return value.replace(/(?:\(주\)|㈜|주식회사)/g, "").replace(/\s+/g, "").toLowerCase();
}

export function normalizeJobKorea(listing: JobKoreaListing, detail?: JobKoreaDetail): CanonicalJob {
  const salaryText = detail?.salaryText ?? listing.salaryText ?? "";
  const salary = normalizeSalary(parseSalary(salaryText, detail ? {} : { bareManwonPeriod: "annual" }));
  const addressOriginalText = detail?.addressOriginalText ?? listing.regionText;
  const canonicalUrl = canonicalizeUrl(detail?.canonicalUrl ?? listing.sourceUrl);
  const expiresAt = detail?.expiresAt ?? null;
  const verifiedAt = detail?.capturedAt ?? listing.capturedAt;
  const multiple = (detail?.workplaceCount ?? 0) > 1;
  const undecided = detail?.locationUndecided ?? false;
  const workplaces = (detail?.workplaces ?? []).map((workplace) => ({
    ...workplace,
    parcelAddress: null,
    accuracy: classifyLocation(workplace),
    isHeadquartersOnly: false,
  }));
  return {
    id: `jobkorea:${listing.sourcePostingId}`,
    source: "jobkorea",
    sourcePostingId: listing.sourcePostingId,
    sourceUrl: listing.sourceUrl,
    canonicalUrl,
    title: detail?.title ?? listing.title,
    companyName: detail?.companyName ?? listing.companyName,
    normalizedCompanyName: normalizeCompany(detail?.companyName ?? listing.companyName),
    descriptionSummary: null,
    categories: listing.categories,
    employmentTypes: detail?.employmentType ? [detail.employmentType] : listing.employmentTypes,
    experienceRequirement: detail?.experienceRequirement ?? listing.experienceRequirement,
    educationRequirement: detail?.educationRequirement ?? listing.educationRequirement,
    salary,
    workDaysOriginalText: detail?.workDaysOriginalText ?? null,
    workStartTime: detail?.workStartTime ?? null,
    workEndTime: detail?.workEndTime ?? null,
    shiftType: null,
    addressOriginalText,
    roadAddress: multiple || undecided ? null : detail?.roadAddress ?? null,
    parcelAddress: null,
    city: multiple || undecided ? null : detail?.city ?? null,
    district: multiple || undecided ? null : detail?.district ?? null,
    neighborhood: multiple || undecided ? null : detail?.neighborhood ?? null,
    nearestStation: multiple || undecided ? null : detail?.nearestStation ?? null,
    latitude: null,
    longitude: null,
    locationAccuracy: classifyLocation({ roadAddress: detail?.roadAddress ?? null, addressOriginalText, city: detail?.city ?? null, district: detail?.district ?? null, neighborhood: detail?.neighborhood ?? null, nearestStation: detail?.nearestStation ?? null, workplaceCount: detail?.workplaceCount ?? null, locationUndecided: undecided }),
    workplaces,
    workplaceCount: detail?.workplaceCount ?? null,
    postedAt: detail?.postedAt ?? listing.postedAt,
    modifiedAt: null,
    expiresAt,
    postingStatus: classifyPostingStatus({ explicitClosed: detail?.explicitClosed ?? false, expiresAt }, new Date(verifiedAt)),
    promoted: listing.promoted,
    remote: null,
    collectedAt: listing.capturedAt,
    lastVerifiedAt: verifiedAt,
    rawPayloadReference: "src/sources/jobkorea/fixtures",
  };
}
