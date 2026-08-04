import type { LocationAccuracy, LocationEvidence } from "../domain/location.js";

export function classifyLocation(evidence: LocationEvidence): LocationAccuracy {
  if ((evidence.workplaceCount ?? 0) > 1) return "multiple_locations";
  if (evidence.locationUndecided) return "location_undecided";
  if (evidence.headquartersOnly) return "headquarters_only";
  if (Number.isFinite(evidence.latitude) && Number.isFinite(evidence.longitude)) return "exact_coordinate";
  if (evidence.roadAddress || evidence.parcelAddress) return "exact_address";
  if (evidence.nearestStation || /역\s*(?:인근|도보|부근|주변|세권)/.test(evidence.addressOriginalText ?? "")) {
    return "station_area";
  }
  if (evidence.neighborhood) return "neighborhood";
  if (evidence.district) return "district";
  if (evidence.city) return "city";
  return "unavailable";
}
