import type { JobSourceAdapter } from "../../domain/source-contract";
import { parseJobKoreaDetail } from "./detail-parser";
import { parseJobKoreaListing } from "./listing-parser";
import { normalizeJobKorea } from "./normalize";
import type { JobKoreaDetail, JobKoreaDetailFixture, JobKoreaListing, JobKoreaListingFixture } from "./types";

export const jobKoreaAdapter: JobSourceAdapter<JobKoreaListingFixture, JobKoreaListing, JobKoreaDetailFixture, JobKoreaDetail> = {
  source: "jobkorea",
  parseListing: parseJobKoreaListing,
  parseDetail: parseJobKoreaDetail,
  normalize: normalizeJobKorea,
};
