import type { CanonicalJob } from "../../domain/canonical-job";
import { classifyLocation } from "../../services/location-classifier";
import { classifyPostingStatus } from "../../services/posting-lifecycle";
import { normalizeSalary } from "../../services/salary-normalizer";
import { parseSalary } from "../../services/salary-parser";
import type { AlbamonDetail, AlbamonListing } from "./types";

function canonicalizeUrl(value: string): string { const url = new URL(value); return `${url.origin}${url.pathname}`; }
function normalizeCompany(value: string): string { return value.replace(/(?:\(주\)|㈜|주식회사)/g, "").replace(/\s+/g, "").toLowerCase(); }

export function normalizeAlbamon(listing: AlbamonListing, detail?: AlbamonDetail): CanonicalJob {
  const salary = normalizeSalary(parseSalary(detail?.salaryText ?? listing.salaryText ?? ""));
  const addressOriginalText = detail?.addressOriginalText ?? listing.regionText;
  const canonicalUrl = canonicalizeUrl(detail?.canonicalUrl ?? listing.sourceUrl);
  const verifiedAt = detail?.capturedAt ?? listing.capturedAt;
  const expiresAt = detail?.expiresAt ?? null;
  return {
    id: `albamon:${listing.sourcePostingId}`, source: "albamon", sourcePostingId: listing.sourcePostingId,
    sourceUrl: listing.sourceUrl, canonicalUrl, title: detail?.title ?? listing.title, companyName: detail?.companyName ?? listing.companyName,
    normalizedCompanyName: normalizeCompany(detail?.companyName ?? listing.companyName), descriptionSummary: null,
    categories: detail?.category ? [detail.category] : [], employmentTypes: detail?.employmentType ? [detail.employmentType] : listing.employmentTypes,
    experienceRequirement: detail?.experienceRequirement ?? null, educationRequirement: detail?.educationRequirement ?? null, salary,
    workDaysOriginalText: detail?.workDaysOriginalText ?? listing.workDaysText, workStartTime: detail?.workStartTime ?? null,
    workEndTime: detail?.workEndTime ?? null, shiftType: null, addressOriginalText, roadAddress: detail?.roadAddress ?? null,
    parcelAddress: null, city: detail?.city ?? null, district: detail?.district ?? null, neighborhood: detail?.neighborhood ?? null,
    nearestStation: detail?.nearestStation ?? null, latitude: detail?.latitude ?? null, longitude: detail?.longitude ?? null,
    locationAccuracy: classifyLocation({ latitude: detail?.latitude ?? null, longitude: detail?.longitude ?? null, roadAddress: detail?.roadAddress ?? null,
      addressOriginalText, city: detail?.city ?? null, district: detail?.district ?? null, neighborhood: detail?.neighborhood ?? null,
      nearestStation: detail?.nearestStation ?? null, workplaceCount: detail?.workplaceCount ?? null, locationUndecided: detail?.locationUndecided ?? false }),
    workplaceCount: detail?.workplaceCount ?? null, postedAt: detail?.postedAt ?? null, modifiedAt: null, expiresAt,
    postingStatus: classifyPostingStatus({ explicitClosed: detail?.explicitClosed ?? false, expiresAt }, new Date(verifiedAt)),
    promoted: listing.promoted, remote: null, collectedAt: listing.capturedAt, lastVerifiedAt: verifiedAt,
    rawPayloadReference: "src/sources/albamon/fixtures",
  };
}
