import type { CanonicalJob } from "../domain/canonical-job";

export type AddressQuality = "full_address" | "city_district" | "region_only" | "multiple_locations" | "unknown" | "contaminated";
export type SalaryQuality = "structured" | "display_only" | "negotiable" | "unknown" | "invalid";

export interface JobDataQuality {
  addressQuality: AddressQuality;
  salaryQuality: SalaryQuality;
  commuteReady: boolean;
}

const compact = (value: string | null | undefined): string => value?.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US") ?? "";

export function isContaminatedLocation(value: string | null | undefined, title: string, company: string): boolean {
  const location = compact(value);
  if (!location) return false;
  const protectedValues = [compact(title), compact(company)].filter((item) => item.length >= 2);
  return protectedValues.some((item) => location === item || (item.length >= 4 && location.includes(item)));
}

export function classifyAddressQuality(job: CanonicalJob): AddressQuality {
  const candidates = [job.addressOriginalText, job.roadAddress, job.parcelAddress, ...job.workplaces.map((item) => item.originalText)];
  if (candidates.some((value) => isContaminatedLocation(value, job.title, job.companyName))) return "contaminated";
  const distinctWorkplaces = new Set(job.workplaces.map((item) => compact(item.originalText)).filter(Boolean));
  if ((job.workplaceCount ?? distinctWorkplaces.size) > 1 || distinctWorkplaces.size > 1) return "multiple_locations";
  const address = compact(job.roadAddress ?? job.parcelAddress ?? job.addressOriginalText);
  if (!address) return "unknown";
  if (job.roadAddress || job.parcelAddress || /(?:로|길|번길|동|리)\s*\d/.test(address)) return "full_address";
  if ((job.city && job.district) || /(?:서울|경기)\S*\s+\S+(?:구|시|군)(?:\s|$)/.test(address)) return "city_district";
  if (/^(?:서울(?:특별시)?|경기(?:도)?)(?:\s*(?:전지역|전체))?$/.test(address)) return "region_only";
  return "unknown";
}

export function classifySalaryQuality(job: CanonicalJob): SalaryQuality {
  const salary = job.salary;
  const amounts = [salary.minimumAmount, salary.maximumAmount].filter((value): value is number => value !== null);
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)
    || (salary.minimumAmount !== null && salary.maximumAmount !== null && salary.maximumAmount < salary.minimumAmount)
    || (amounts.length > 0 && salary.currency !== "KRW")) return "invalid";
  if (salary.negotiable || salary.type === "negotiable") return "negotiable";
  if (salary.minimumAmount !== null && ["hourly", "daily", "weekly", "monthly", "annual", "per_task"].includes(salary.type)) return "structured";
  if (salary.originalText.trim()) return "display_only";
  return "unknown";
}

export function hasReliableCoordinates(job: CanonicalJob): boolean {
  return job.latitude !== null && job.longitude !== null
    && Number.isFinite(job.latitude) && Number.isFinite(job.longitude)
    && job.latitude >= -90 && job.latitude <= 90 && job.longitude >= -180 && job.longitude <= 180;
}

export function assessJobDataQuality(job: CanonicalJob): JobDataQuality {
  const addressQuality = classifyAddressQuality(job);
  const salaryQuality = classifySalaryQuality(job);
  return { addressQuality, salaryQuality, commuteReady: hasReliableCoordinates(job) || addressQuality === "full_address" };
}
