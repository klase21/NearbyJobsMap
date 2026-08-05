"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { UiJobRecord, UserOrigin } from "../../domain/ui-job";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { OriginControls } from "./OriginControls";
import { isMapEligible } from "../../services/job-search";

const JobMapClient = dynamic(() => import("./JobMapClient"), {
  ssr: false,
  loading: () => <div className="state-panel" role="status"><h2>지도를 불러오는 중입니다</h2><p>목록은 계속 사용할 수 있습니다.</p></div>,
});

interface MapPanelProps {
  records: UiJobRecord[];
  selectedJobId: string | null;
  origin: UserOrigin;
  focusRequest: number;
  onSelect(jobId: string): void;
  onOriginChange(origin: UserOrigin): void;
}

export function MapPanel(props: MapPanelProps) {
  const [selectingOrigin, setSelectingOrigin] = useState(false);
  const [fitRequest, setFitRequest] = useState(1);
  const [tileErrors, setTileErrors] = useState(0);
  const mappedCount = props.records.filter(isMapEligible).length;
  const updateOrigin = (origin: UserOrigin) => { props.onOriginChange(origin); setSelectingOrigin(false); };
  return (
    <section className="map-panel" aria-label="현재 필터 결과 지도">
      <OriginControls origin={props.origin} selecting={selectingOrigin} onSelectingChange={setSelectingOrigin} onOriginChange={updateOrigin} onFitJobs={() => setFitRequest((value) => value + 1)} />
      <div className="map-wrap" role="region" aria-label={`좌표가 있는 공고 ${mappedCount}건 지도`}>
        {mappedCount === 0 ? <div className="state-panel"><h2>지도에 표시할 좌표가 없습니다</h2><p>현재 조건의 공고는 목록에서 확인해 주세요. 주소를 좌표로 변환하지 않았습니다.</p></div>
          : <MapErrorBoundary><JobMapClient records={props.records} selectedJobId={props.selectedJobId} origin={props.origin} selectingOrigin={selectingOrigin}
              fitRequest={fitRequest} focusRequest={props.focusRequest} onSelect={props.onSelect} onOriginChange={updateOrigin} onTileError={() => setTileErrors((value) => value + 1)} /></MapErrorBoundary>}
        {mappedCount > 0 && <div className="map-legend" aria-label="지도 범례">
          <span className="legend-row"><span className="legend-dot" />정확 좌표</span><span className="legend-row"><span className="legend-dot estimated" />추정 위치</span>
          <span className="legend-row"><span className="legend-dot selected" />선택 공고</span><span className="legend-row"><span className="legend-dot origin" />출발지</span>
        </div>}
        {selectingOrigin && <div className="map-status" role="status">지도를 클릭하면 출발지가 한 번 설정됩니다. GPS 권한은 요청하지 않습니다.</div>}
        {tileErrors >= 3 && <div className="map-status" role="alert">지도 타일을 불러오지 못했습니다. 공고 목록과 주소 정보는 계속 사용할 수 있습니다.</div>}
      </div>
    </section>
  );
}
