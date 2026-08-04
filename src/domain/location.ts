export type LocationAccuracy =
  | "exact_coordinate"
  | "exact_address"
  | "neighborhood"
  | "district"
  | "city"
  | "station_area"
  | "multiple_locations"
  | "headquarters_only"
  | "location_undecided"
  | "unavailable";

export interface LocationEvidence {
  latitude?: number | null;
  longitude?: number | null;
  roadAddress?: string | null;
  parcelAddress?: string | null;
  addressOriginalText?: string | null;
  city?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  nearestStation?: string | null;
  workplaceCount?: number | null;
  headquartersOnly?: boolean;
  locationUndecided?: boolean;
}
