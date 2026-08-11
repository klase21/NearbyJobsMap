import Link from "next/link";
import { headers } from "next/headers";
import { CollectionDashboard } from "../../components/collection/CollectionDashboard";
import { collectionUiFeatureEnabled } from "../../server/collection-control/access";
import { COLLECTION_PRESETS } from "../../sources/collection/collection-presets";
import { LocalHelpPanel } from "../../components/help/LocalHelpPanel";
import { getLocalReadiness } from "../../server/local-readiness/service";
import { isVercelPublicDemo } from "../../server/runtime/public-demo";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const enabled = collectionUiFeatureEnabled();
  const publicDemo = isVercelPublicDemo();
  const readiness = getLocalReadiness((await headers()).get("host"));
  return <main className="collection-page">
    <header className="collection-page-header">
      <div><p className="eyebrow">로컬 운영 도구</p><h1>수집 관리</h1><p>저장된 공고와 최근 수집 결과를 확인하고, 잡코리아·알바몬 프리셋을 수동으로 실행합니다.</p></div>
      <Link className="button soft" href="/">공고 목록으로 이동</Link>
    </header>
    {publicDemo && <section className="collection-disabled" role="status"><h2>읽기 전용 공개 데모</h2><p>공개 데모에서는 수집 기능을 실행할 수 없습니다. 데모 공고의 목록·필터·지도 기능만 확인할 수 있습니다.</p></section>}
    <LocalHelpPanel readiness={readiness} compact />
    <CollectionDashboard enabled={enabled} presets={Object.values(COLLECTION_PRESETS)} />
  </main>;
}
