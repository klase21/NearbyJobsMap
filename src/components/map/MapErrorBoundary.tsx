"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface MapErrorBoundaryProps { children: ReactNode }
interface MapErrorBoundaryState { failed: boolean }

export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The user-facing fallback intentionally avoids exposing source or stack details.
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="state-panel" role="alert">
          <h2>지도를 표시할 수 없습니다</h2>
          <p>공고 목록과 주소 정보는 계속 사용할 수 있습니다.</p>
          <button className="button" type="button" onClick={() => window.location.reload()}>지도 다시 불러오기</button>
        </div>
      );
    }
    return this.props.children;
  }
}
