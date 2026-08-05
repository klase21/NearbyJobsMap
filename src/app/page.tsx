import { NearbyJobsDashboard } from "../components/dashboard/NearbyJobsDashboard";
import { getUiJobs } from "../data/job-provider";

export default function HomePage() {
  try {
    return <NearbyJobsDashboard initialJobs={getUiJobs()} />;
  } catch {
    return <NearbyJobsDashboard initialJobs={[]} dataError="공고 데이터를 준비하지 못했습니다. fixture 계약을 다시 확인해 주세요." />;
  }
}
