import type { JobSourceAdapter } from "../../domain/source-contract.js";
import { parseAlbamonDetail } from "./detail-parser.js";
import { parseAlbamonListing } from "./listing-parser.js";
import { normalizeAlbamon } from "./normalize.js";
import type { AlbamonDetail, AlbamonDetailFixture, AlbamonListing, AlbamonListingFixture } from "./types.js";

export const albamonAdapter: JobSourceAdapter<AlbamonListingFixture, AlbamonListing, AlbamonDetailFixture, AlbamonDetail> = {
  source: "albamon", parseListing: parseAlbamonListing, parseDetail: parseAlbamonDetail, normalize: normalizeAlbamon,
};
