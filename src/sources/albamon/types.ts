import type { FixtureMetadata } from "../../domain/source-contract.js";

export interface AlbamonListingFixtureItem {
  sourcePostingId?: string;
  sourceUrl?: string;
  title?: string;
  companyName?: string;
  salaryText?: string | null;
  regionText?: string | null;
  workDaysText?: string | null;
  workHoursText?: string | null;
  employmentTypes?: string[];
  deadlineText?: string | null;
  promoted?: boolean | null;
}

export interface AlbamonListingFixture { metadata: FixtureMetadata; items?: AlbamonListingFixtureItem[] }

export interface AlbamonJsonLd {
  "@type"?: string;
  title?: unknown;
  datePosted?: unknown;
  validThrough?: unknown;
  employmentType?: unknown;
  experienceRequirements?: unknown;
  hiringOrganization?: { name?: unknown };
  baseSalary?: { currency?: unknown; value?: { value?: unknown; minValue?: unknown; maxValue?: unknown; unitText?: unknown } };
  jobLocation?: Array<{ address?: { streetAddress?: unknown; addressLocality?: unknown; addressRegion?: unknown } }> | { address?: { streetAddress?: unknown; addressLocality?: unknown; addressRegion?: unknown } };
  workHours?: unknown;
}

export interface AlbamonDetailFixture {
  metadata: FixtureMetadata;
  sourceUrl: string;
  jsonLdBlocks?: unknown[];
  visible?: {
    salaryText?: string | null;
    workDaysText?: string | null;
    workHoursText?: string | null;
    educationRequirement?: string | null;
    category?: string | null;
    addressText?: string | null;
    district?: string | null;
    neighborhood?: string | null;
    nearestStation?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    workplaceCount?: number | null;
    locationUndecided?: boolean;
    explicitClosed?: boolean;
  };
}

export interface AlbamonListing {
  sourcePostingId: string; sourceUrl: string; title: string; companyName: string;
  salaryText: string | null; regionText: string | null; workDaysText: string | null; workHoursText: string | null;
  employmentTypes: string[]; deadlineText: string | null; promoted: boolean | null; capturedAt: string;
}

export interface AlbamonDetail {
  sourcePostingId: string | null; canonicalUrl: string; title: string | null; companyName: string | null;
  salaryText: string | null; structuredSalaryMinimum: number | null; structuredSalaryMaximum: number | null;
  employmentType: string | null; experienceRequirement: string | null; educationRequirement: string | null;
  category: string | null; addressOriginalText: string | null; roadAddress: string | null; city: string | null; district: string | null;
  neighborhood: string | null; nearestStation: string | null; latitude: number | null; longitude: number | null;
  workDaysOriginalText: string | null; workStartTime: string | null; workEndTime: string | null;
  postedAt: string | null; expiresAt: string | null; explicitClosed: boolean; workplaceCount: number | null;
  locationUndecided: boolean; capturedAt: string;
}
