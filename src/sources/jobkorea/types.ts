import type { FixtureMetadata } from "../../domain/source-contract";

export interface JobKoreaListingFixtureItem {
  sourcePostingId?: string;
  sourceUrl?: string;
  title?: string;
  companyName?: string;
  salaryText?: string | null;
  regionText?: string | null;
  categories?: string[];
  employmentTypes?: string[];
  experienceRequirement?: string | null;
  educationRequirement?: string | null;
  postedAt?: string | null;
  deadlineText?: string | null;
  promoted?: boolean | null;
}

export interface JobKoreaListingFixture {
  metadata: FixtureMetadata;
  items?: JobKoreaListingFixtureItem[];
}

export interface JobKoreaJsonLd {
  "@type"?: string;
  title?: unknown;
  datePosted?: unknown;
  validThrough?: unknown;
  employmentType?: unknown;
  experienceRequirements?: unknown;
  educationRequirements?: unknown;
  identifier?: { value?: unknown };
  url?: unknown;
  hiringOrganization?: { name?: unknown };
  baseSalary?: {
    currency?: unknown;
    value?: { minValue?: unknown; maxValue?: unknown; value?: unknown; unitText?: unknown };
  };
  jobLocation?: Array<{ address?: { streetAddress?: unknown; addressLocality?: unknown; addressRegion?: unknown } }> | { address?: { streetAddress?: unknown; addressLocality?: unknown; addressRegion?: unknown } };
}

export interface JobKoreaWorkplaceEvidence {
  originalText: string;
  roadAddress: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  nearestStation: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface JobKoreaDetailFixture {
  metadata: FixtureMetadata;
  sourceUrl: string;
  jsonLdBlocks?: unknown[];
  visible?: {
    salaryText?: string | null;
    workDaysText?: string | null;
    workHoursText?: string | null;
    nearestStation?: string | null;
    addressText?: string | null;
    city?: string | null;
    district?: string | null;
    neighborhood?: string | null;
    explicitClosed?: boolean;
    workplaceCount?: number | null;
    workplaces?: JobKoreaWorkplaceEvidence[];
    headquartersAddressText?: string | null;
    locationUndecided?: boolean;
  };
}

export interface JobKoreaListing {
  sourcePostingId: string;
  sourceUrl: string;
  title: string;
  companyName: string;
  salaryText: string | null;
  regionText: string | null;
  categories: string[];
  employmentTypes: string[];
  experienceRequirement: string | null;
  educationRequirement: string | null;
  postedAt: string | null;
  deadlineText: string | null;
  promoted: boolean | null;
  capturedAt: string;
}

export interface JobKoreaDetail {
  sourcePostingId: string | null;
  canonicalUrl: string | null;
  title: string | null;
  companyName: string | null;
  salaryText: string | null;
  structuredSalaryMinimum: number | null;
  structuredSalaryMaximum: number | null;
  employmentType: string | null;
  experienceRequirement: string | null;
  educationRequirement: string | null;
  addressOriginalText: string | null;
  roadAddress: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  nearestStation: string | null;
  workDaysOriginalText: string | null;
  workStartTime: string | null;
  workEndTime: string | null;
  postedAt: string | null;
  expiresAt: string | null;
  explicitClosed: boolean;
  workplaces: JobKoreaWorkplaceEvidence[];
  workplaceCount: number | null;
  locationUndecided: boolean;
  capturedAt: string;
}
