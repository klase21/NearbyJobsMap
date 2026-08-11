import type { CanonicalJob, CanonicalWorkplace } from "../../domain/canonical-job";
import { classifyLocation } from "../../services/location-classifier";
import { classifyPostingStatus } from "../../services/posting-lifecycle";
import { normalizeRegionText } from "../../services/region-normalizer";
import { normalizeSalary } from "../../services/salary-normalizer";
import { parseSalary } from "../../services/salary-parser";
import type { AlbamonDetail, AlbamonListing } from "./types";

function canonicalizeUrl(value: string): string { const url = new URL(value); return `${url.origin}${url.pathname}`; }
function normalizeCompany(value: string): string { return value.replace(/(?:\(주\)|㈜|주식회사)/gu, "").replace(/\s+/gu, "").toLowerCase(); }
function parseHours(value: string | null | undefined): [string | null, string | null] {
  const match = value?.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/u);
  return [match?.[1] ?? null, match?.[2] ?? null];
}
function validCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= 33 && latitude <= 39.5
    && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= 124 && longitude <= 132;
}
function listingSalary(listing: AlbamonListing) {
  const parsed = parseSalary(listing.salaryText ?? "");
  if (listing.salaryFromStructured && !listing.payType) {
    return { ...parsed, type: "unknown" as const, minimumAmount: null, maximumAmount: null, currency: null };
  }
  return listing.payType && parsed.minimumAmount !== null ? { ...parsed, type: listing.payType } : parsed;
}
function listingLocationParts(listing: AlbamonListing): { city: string | null; district: string | null; neighborhood: string | null } {
  if (listing.regionConflict) return { city: null, district: null, neighborhood: null };
  const evidence = listing.regionText ?? listing.workplaceAddress ?? "";
  const regions = normalizeRegionText(evidence).regions;
  const city = regions.includes("seoul") ? "서울" : regions.includes("gyeonggi") ? "경기" : null;
  const district = evidence.match(/(?:서울(?:특별시)?|경기(?:도)?)\s+([^\s]+(?:구|시|군))/u)?.[1] ?? null;
  const neighborhood = evidence.match(/\s+([^\s]+(?:동|읍|면))(?:\s|$)/u)?.[1] ?? null;
  return { city, district, neighborhood };
}

export function normalizeAlbamon(listing: AlbamonListing, detail?: AlbamonDetail): CanonicalJob {
  const salary = detail ? normalizeSalary(parseSalary(detail.salaryText ?? listing.salaryText ?? "")) : listingSalary(listing);
  const addressOriginalText = detail?.addressOriginalText ?? listing.regionText;
  const canonicalUrl = canonicalizeUrl(detail?.canonicalUrl ?? listing.sourceUrl);
  const verifiedAt = detail?.capturedAt ?? listing.capturedAt;
  const multiple = (detail?.workplaceCount ?? 0) > 1;
  const undecided = detail?.locationUndecided ?? false;
  const listingCoordinatesValid = !listing.regionConflict && validCoordinates(listing.latitude, listing.longitude);
  const listingParts = listingLocationParts(listing);
  const listingWorkplaces: CanonicalWorkplace[] = listing.workplaceAddress ? [{
    originalText: listing.workplaceAddress, roadAddress: listing.workplaceAddress, parcelAddress: null, ...listingParts,
    nearestStation: null, latitude: listingCoordinatesValid ? listing.latitude ?? null : null,
    longitude: listingCoordinatesValid ? listing.longitude ?? null : null,
    accuracy: classifyLocation({ roadAddress: listing.workplaceAddress, latitude: listingCoordinatesValid ? listing.latitude ?? null : null,
      longitude: listingCoordinatesValid ? listing.longitude ?? null : null }), isHeadquartersOnly: false,
  }] : [];
  const workplaces = (detail?.workplaces ?? listingWorkplaces).map((workplace) => ({
    ...workplace, parcelAddress: null, accuracy: classifyLocation(workplace), isHeadquartersOnly: false,
  }));
  const [listingStartTime, listingEndTime] = parseHours(listing.workHoursText);
  const latitude = multiple || undecided ? null : detail?.latitude ?? (listingCoordinatesValid ? listing.latitude ?? null : null);
  const longitude = multiple || undecided ? null : detail?.longitude ?? (listingCoordinatesValid ? listing.longitude ?? null : null);
  const roadAddress = multiple || undecided ? null : detail?.roadAddress ?? listing.workplaceAddress ?? null;
  const city = multiple || undecided ? null : detail?.city ?? listingParts.city;
  const district = multiple || undecided ? null : detail?.district ?? listingParts.district;
  const neighborhood = multiple || undecided ? null : detail?.neighborhood ?? listingParts.neighborhood;
  const expiresAt = detail?.expiresAt ?? listing.deadlineText?.match(/^\d{4}-\d{2}-\d{2}$/u)?.[0] ?? null;
  return {
    id: `albamon:${listing.sourcePostingId}`, source: "albamon", sourcePostingId: listing.sourcePostingId,
    sourceUrl: listing.sourceUrl, canonicalUrl, title: detail?.title ?? listing.title, companyName: detail?.companyName ?? listing.companyName,
    normalizedCompanyName: normalizeCompany(detail?.companyName ?? listing.companyName), descriptionSummary: null,
    categories: detail?.category ? [detail.category] : [], employmentTypes: detail?.employmentType ? [detail.employmentType] : listing.employmentTypes,
    experienceRequirement: detail?.experienceRequirement ?? null, educationRequirement: detail?.educationRequirement ?? null, salary,
    workDaysOriginalText: detail?.workDaysOriginalText ?? listing.workDaysText, workStartTime: detail?.workStartTime ?? listingStartTime,
    workEndTime: detail?.workEndTime ?? listingEndTime, shiftType: null, addressOriginalText, roadAddress, parcelAddress: null,
    city, district, neighborhood, nearestStation: multiple || undecided ? null : detail?.nearestStation ?? null,
    latitude, longitude, locationAccuracy: classifyLocation({ latitude, longitude, roadAddress, addressOriginalText, city, district, neighborhood,
      nearestStation: detail?.nearestStation ?? null, workplaceCount: detail?.workplaceCount ?? (listingWorkplaces.length || null),
      locationUndecided: detail?.locationUndecided ?? false }),
    workplaces, workplaceCount: detail?.workplaceCount ?? (listingWorkplaces.length || null), postedAt: detail?.postedAt ?? null,
    modifiedAt: null, expiresAt, postingStatus: classifyPostingStatus({ explicitClosed: detail?.explicitClosed ?? false, expiresAt }, new Date(verifiedAt)),
    promoted: listing.promoted, remote: null, collectedAt: listing.capturedAt, lastVerifiedAt: verifiedAt,
    rawPayloadReference: "src/sources/albamon/fixtures",
  };
}
