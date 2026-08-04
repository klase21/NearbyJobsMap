import type { JobSourceAdapter } from "../../domain/source-contract.js";
import { parseJobKoreaDetail } from "./detail-parser.js";
import { parseJobKoreaListing } from "./listing-parser.js";
import { normalizeJobKorea } from "./normalize.js";
import type { JobKoreaDetail, JobKoreaDetailFixture, JobKoreaListing, JobKoreaListingFixture } from "./types.js";

export const jobKoreaAdapter: JobSourceAdapter<JobKoreaListingFixture, JobKoreaListing, JobKoreaDetailFixture, JobKoreaDetail> = {
  source: "jobkorea",
  parseListing: parseJobKoreaListing,
  parseDetail: parseJobKoreaDetail,
  normalize: normalizeJobKorea,
};
