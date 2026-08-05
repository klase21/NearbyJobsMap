import type { MapPosition, UserOrigin } from "../domain/ui-job";

const EARTH_RADIUS_KM = 6_371;
const toRadians = (value: number): number => (value * Math.PI) / 180;

export function haversineDistanceKm(origin: UserOrigin, destination: MapPosition): number {
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateOrigin(input: Pick<UserOrigin, "name" | "latitude" | "longitude">): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("출발지 이름을 입력해 주세요.");
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) errors.push("위도는 -90부터 90 사이여야 합니다.");
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) errors.push("경도는 -180부터 180 사이여야 합니다.");
  return errors;
}
