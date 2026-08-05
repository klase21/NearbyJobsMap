import type { JobSourceAdapter } from "../../domain/source-contract";
import { parseAlbamonDetail } from "./detail-parser";
import { parseAlbamonListing } from "./listing-parser";
import { normalizeAlbamon } from "./normalize";
import type { AlbamonDetail, AlbamonDetailFixture, AlbamonListing, AlbamonListingFixture } from "./types";

export const albamonAdapter: JobSourceAdapter<AlbamonListingFixture, AlbamonListing, AlbamonDetailFixture, AlbamonDetail> = {
  source: "albamon", parseListing: parseAlbamonListing, parseDetail: parseAlbamonDetail, normalize: normalizeAlbamon,
};
