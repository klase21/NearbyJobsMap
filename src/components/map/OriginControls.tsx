"use client";

import { useEffect, useState } from "react";
import type { UserOrigin } from "../../domain/ui-job";
import { DEFAULT_ORIGIN } from "../../repositories/preferences-repository";
import { validateOrigin } from "../../services/distance";

interface OriginControlsProps {
  origin: UserOrigin;
  selecting: boolean;
  onSelectingChange(selecting: boolean): void;
  onOriginChange(origin: UserOrigin): void;
  onFitJobs(): void;
}

export function OriginControls({ origin, selecting, onSelectingChange, onOriginChange, onFitJobs }: OriginControlsProps) {
  const [name, setName] = useState(origin.name);
  const [latitude, setLatitude] = useState(String(origin.latitude));
  const [longitude, setLongitude] = useState(String(origin.longitude));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setName(origin.name); setLatitude(String(origin.latitude)); setLongitude(String(origin.longitude)); }, [origin]);

  const apply = () => {
    const next = { name, latitude: Number(latitude), longitude: Number(longitude), example: false };
    const errors = validateOrigin(next);
    if (errors.length) { setError(errors.join(" ")); return; }
    setError(null); onOriginChange(next);
  };
  return (
    <section className="origin-controls" aria-label="출발지와 지도 설정">
      <div className="origin-field"><label htmlFor="origin-name">출발지 이름</label><input id="origin-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="origin-field"><label htmlFor="origin-lat">위도</label><input id="origin-lat" className="text-input" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></div>
      <div className="origin-field"><label htmlFor="origin-lon">경도</label><input id="origin-lon" className="text-input" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></div>
      <button className="button compact" type="button" onClick={apply}>출발지 적용</button>
      <button className={`button compact ${selecting ? "primary" : ""}`} type="button" aria-pressed={selecting} onClick={() => onSelectingChange(!selecting)}>{selecting ? "지도 클릭 대기 중" : "지도에서 선택"}</button>
      <div className="filter-actions">
        <button className="button compact" type="button" onClick={() => { setError(null); onOriginChange(DEFAULT_ORIGIN); }}>범계역으로 초기화</button>
        <button className="button compact" type="button" onClick={onFitJobs}>표시 공고 맞추기</button>
      </div>
      {error && <p className="origin-error" role="alert">{error}</p>}
      <p className="origin-note">직선거리 기준이며 실제 이동시간과 다를 수 있습니다. 지도 클릭으로 정한 출발지도 이 브라우저에 한 곳만 저장됩니다.</p>
    </section>
  );
}
