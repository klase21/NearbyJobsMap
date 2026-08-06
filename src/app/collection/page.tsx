import Link from "next/link";
import { CollectionDashboard } from "../../components/collection/CollectionDashboard";
import { collectionUiFeatureEnabled } from "../../server/collection-control/access";
import { COLLECTION_PRESETS } from "../../sources/collection/collection-presets";

export const dynamic = "force-dynamic";

export default function CollectionPage() {
  const enabled = collectionUiFeatureEnabled();
  return <main className="collection-page">
    <header className="collection-page-header">
      <div><p className="eyebrow">로컬 운영 도구</p><h1>수집 관리</h1><p>저장된 공고와 최근 수집 결과를 확인하고, 잡코리아·알바몬 프리셋을 수동으로 실행합니다.</p></div>
      <Link className="button soft" href="/">공고 목록으로 이동</Link>
    </header>
    <CollectionDashboard enabled={enabled} presets={Object.values(COLLECTION_PRESETS)} />
  </main>;
}
