"use client";

import L, { LatLngBounds } from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { UiJobRecord, UserOrigin } from "../../domain/ui-job";
import { haversineDistanceKm } from "../../services/distance";
import { LOCATION_LABELS, SOURCE_LABELS } from "../../services/job-display";
import { getMapPositions, isMapEligible } from "../../services/job-search";

interface JobMapClientProps {
  records: UiJobRecord[];
  selectedJobId: string | null;
  origin: UserOrigin;
  selectingOrigin: boolean;
  fitRequest: number;
  focusRequest: number;
  onSelect(jobId: string): void;
  onOriginChange(origin: UserOrigin): void;
  onTileError(): void;
}

function markerIcon(className: string, size = 22) {
  return L.divIcon({ className: "", html: `<span class="custom-marker ${className}" aria-hidden="true"></span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}

function MapEffects({ records, selectedJobId, fitRequest, focusRequest }: Pick<JobMapClientProps, "records" | "selectedJobId" | "fitRequest" | "focusRequest">) {
  const map = useMap();
  const lastFitRequest = useRef<number | null>(null);
  const lastFocusRequest = useRef(0);
  useEffect(() => {
    const initialFit = lastFitRequest.current === null;
    const explicitlyRequested = lastFitRequest.current !== null && lastFitRequest.current !== fitRequest;
    lastFitRequest.current = fitRequest;
    if (!initialFit && !explicitlyRequested) return;
    const positions = records.flatMap((record) => getMapPositions(record).map((position) => [position.latitude, position.longitude] as [number, number]));
    if (positions.length === 1) map.setView(positions[0]!, 13);
    else if (positions.length > 1) map.fitBounds(new LatLngBounds(positions), { padding: [42, 42], maxZoom: 13 });
  }, [fitRequest, map, records]);
  useEffect(() => {
    const explicitlyRequested = lastFocusRequest.current !== focusRequest;
    lastFocusRequest.current = focusRequest;
    if (!explicitlyRequested) return;
    const selectedRecord = records.find((record) => record.job.id === selectedJobId);
    const selected = selectedRecord ? getMapPositions(selectedRecord)[0] ?? null : null;
    if (!selected) return;
    const target: [number, number] = [selected.latitude, selected.longitude];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) map.setView(target, Math.max(map.getZoom(), 13));
    else map.flyTo(target, Math.max(map.getZoom(), 13), { duration: .5 });
  }, [focusRequest, map, records, selectedJobId]);
  return null;
}

function OriginSelection({ enabled, onOriginChange }: { enabled: boolean; onOriginChange(origin: UserOrigin): void }) {
  useMapEvents({ click(event) { if (enabled) onOriginChange({ name: "지도에서 선택한 출발지", latitude: event.latlng.lat, longitude: event.latlng.lng, example: false }); } });
  return null;
}

export default function JobMapClient(props: JobMapClientProps) {
  const mapped = props.records.filter(isMapEligible);
  return (
    <MapContainer center={[37.44, 126.98]} zoom={10} scrollWheelZoom className="leaflet-container" zoomControl>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        eventHandlers={{ tileerror: props.onTileError }} />
      <MapEffects records={props.records} selectedJobId={props.selectedJobId} fitRequest={props.fitRequest} focusRequest={props.focusRequest} />
      <OriginSelection enabled={props.selectingOrigin} onOriginChange={props.onOriginChange} />
      <Marker position={[props.origin.latitude, props.origin.longitude]} icon={markerIcon("origin")} title={`${props.origin.name} 출발지`}>
        <Popup><strong>{props.origin.name}</strong><p className="popup-meta">거리 계산 기준점</p></Popup>
      </Marker>
      {mapped.flatMap((record) => getMapPositions(record).map((position, positionIndex) => {
        const selected = record.job.id === props.selectedJobId;
        return (
          <Marker key={`${record.job.id}:${positionIndex}`} position={[position.latitude, position.longitude]}
            icon={markerIcon(selected ? "selected" : position.kind === "estimated" ? "estimated" : "", selected ? 30 : 22)}
            title={`${record.job.title}, ${record.job.companyName} 지도 마커`}
            eventHandlers={{ click: () => props.onSelect(record.job.id) }}>
            <Popup>
              <p className="popup-title">{record.job.title}</p><p className="popup-company">{record.job.companyName}</p>
              <p className="popup-salary">{record.job.salary.originalText || "급여 미확인"}</p>
              <p className="popup-meta">{SOURCE_LABELS[record.job.source as keyof typeof SOURCE_LABELS]} · {LOCATION_LABELS[record.job.locationAccuracy]}</p>
              <p className="popup-meta">{props.origin.name} 기준 {haversineDistanceKm(props.origin, position).toFixed(1)}km</p>
              {record.isFictional && <p className="popup-meta">기능 검증용 가상 공고</p>}
            </Popup>
          </Marker>
        );
      }))}
    </MapContainer>
  );
}
