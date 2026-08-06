import Link from "next/link";
import { CollectionControl } from "../../components/collection/CollectionControl";
import { collectionUiFeatureEnabled } from "../../server/collection-control/access";
import { COLLECTION_PRESETS } from "../../sources/collection/collection-presets";

export const dynamic = "force-dynamic";

export default function CollectionPage() {
  const enabled = collectionUiFeatureEnabled();
  return <main className="collection-page">
    <header className="collection-page-header">
      <div><p className="eyebrow">로컬 운영 도구</p><h1>수집 관리</h1><p>잡코리아·알바몬 프리셋을 수동으로 드라이런한 뒤 같은 설정만 SQLite에 반영합니다.</p></div>
      <Link className="button soft" href="/">채용 목록으로</Link>
    </header>
    <CollectionControl enabled={enabled} presets={Object.values(COLLECTION_PRESETS)} />
  </main>;
}
