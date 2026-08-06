export type NormalizedRegion = "seoul" | "gyeonggi" | "incheon" | "other";
export type RegionNormalizationConfidence = "exact" | "mapped_city" | "multiple" | "unknown";
export type CollectionRegion = "seoul" | "gyeonggi";

export interface NormalizedRegionEvidence {
  originalText: string | null;
  regions: NormalizedRegion[];
  confidence: RegionNormalizationConfidence;
}

const SEOUL_DISTRICTS = ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"];
const GYEONGGI_CITIES = ["수원시","성남시","의정부시","안양시","부천시","광명시","평택시","동두천시","안산시","고양시","과천시","구리시","남양주시","오산시","시흥시","군포시","의왕시","하남시","용인시","파주시","이천시","안성시","김포시","화성시","광주시","양주시","포천시","여주시","연천군","가평군","양평군"];
const OTHER_REGION_PATTERN = /(?:부산|대구|대전|광주광역시|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/;
const UNKNOWN_PATTERN = /^(?:전국|전지역|재택|원격|협의|미정|-|)$/;

const includesAny = (text: string, values: string[]): boolean => values.some((value) => text.includes(value));

export function normalizeRegionText(value: string | null | undefined): NormalizedRegionEvidence {
  const originalText = value?.replace(/\s+/g, " ").trim() || null;
  if (!originalText || UNKNOWN_PATTERN.test(originalText)) return { originalText, regions: [], confidence: "unknown" };
  const regions = new Set<NormalizedRegion>();
  const directSeoul = /(?:^|[\s,·/])서울(?:특별시|\s*전지역|전체)?(?=$|[\s,·/])/.test(originalText);
  const directGyeonggi = /(?:^|[\s,·/])경기(?:도|\s*전지역|전체)?(?=$|[\s,·/])/.test(originalText);
  const mappedGyeonggi = includesAny(originalText, GYEONGGI_CITIES);
  const mappedSeoul = !mappedGyeonggi && includesAny(originalText, SEOUL_DISTRICTS);
  if (directSeoul || mappedSeoul) regions.add("seoul");
  if (directGyeonggi || mappedGyeonggi) regions.add("gyeonggi");
  if (/인천(?:광역시)?/.test(originalText)) regions.add("incheon");
  if (OTHER_REGION_PATTERN.test(originalText)) regions.add("other");
  const normalized = [...regions];
  if (!normalized.length) return { originalText, regions: [], confidence: "unknown" };
  if (normalized.length > 1) return { originalText, regions: normalized, confidence: "multiple" };
  return { originalText, regions: normalized, confidence: directSeoul || directGyeonggi || normalized[0] === "incheon" || normalized[0] === "other" ? "exact" : "mapped_city" };
}

export function matchesCollectionRegions(evidence: NormalizedRegionEvidence, requested: CollectionRegion[]): boolean {
  return requested.length === 0 || requested.some((region) => evidence.regions.includes(region));
}

export const SEOUL_REGION_MAPPINGS = [...SEOUL_DISTRICTS];
export const GYEONGGI_REGION_MAPPINGS = [...GYEONGGI_CITIES];
