import type { CanonicalJob } from "./canonical-job.js";
import type { JobSource } from "./job-source.js";

export type EvidenceClassification =
  | "Observed"
  | "Officially documented"
  | "Inferred"
  | "Unknown";

export interface FixtureMetadata {
  source: "jobkorea" | "albamon";
  capturedAt: string;
  sourcePageType: "listing" | "detail";
  evidenceType: "observed_html" | "observed_json_ld" | "observed_internal_json";
  sanitized: true;
  notes: string[];
}

export interface ParseDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  field: string | null;
  message: string;
}

export interface ParseResult<T> {
  value: T | null;
  diagnostics: ParseDiagnostic[];
}

export interface SourceListingPage<T> {
  items: ParseResult<T>[];
  diagnostics: ParseDiagnostic[];
}

export interface JobSourceAdapter<TListingInput, TListing, TDetailInput, TDetail> {
  readonly source: JobSource;
  parseListing(input: TListingInput): SourceListingPage<TListing>;
  parseDetail(input: TDetailInput): ParseResult<TDetail>;
  normalize(listing: TListing, detail?: TDetail): CanonicalJob;
}
