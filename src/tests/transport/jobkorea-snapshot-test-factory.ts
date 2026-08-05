import { validateAndRoundTripJobKoreaSnapshot } from "../../sources/jobkorea/transport/jobkorea-page-snapshot";
import type { JobKoreaPageSnapshot, JobKoreaSnapshotOrdinaryCandidate } from "../../sources/jobkorea/transport/jobkorea-search-types";

export const jobKoreaCandidate = (id: string, overrides: Partial<JobKoreaSnapshotOrdinaryCandidate> = {}): JobKoreaSnapshotOrdinaryCandidate => ({
  postingId: id, href: `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}?logpath=x`, title: `공고 ${id}`,
  companyName: `회사 ${id}`, position: 1, rowId: id, sourceSelector: "tr.devloopArea[data-gno]", ...overrides,
});

export function jobKoreaSnapshot(
  ordinaryCandidates: JobKoreaSnapshotOrdinaryCandidate[] = [],
  overrides: Omit<Partial<JobKoreaPageSnapshot>, "evidence"> & { evidence?: Partial<JobKoreaPageSnapshot["evidence"]> } = {},
): JobKoreaPageSnapshot {
  const count = ordinaryCandidates.length;
  const base: JobKoreaPageSnapshot = {
    schemaVersion: 2, serializedSnapshotBytes: 0,
    finalUrl: "https://www.jobkorea.co.kr/Search?stext=AI&Page_No=1", pageTitle: "검색",
    documentReadyState: "complete", extractionCompleted: true, extractionDurationMs: 1,
    readiness: { reason: count ? "numeric_detail_link" : "unknown", numericDetailLinkCount: count, ordinaryContainerCount: count },
    domChangedAfterReadiness: false,
    evidence: { ordinaryContainerCount: count, ordinaryRowCount: count, resultRootCount: count ? 1 : 0,
      knownTableResultCount: count ? 1 : 0, knownListResultCount: 0, knownCardResultCount: 0,
      numericLinksInsideKnownTableResults: count, numericLinksInsideKnownListResults: 0, numericLinksInsideKnownCardResults: 0,
      ordinaryDetailLinkCount: count, allNumericDetailLinkCount: count, promotedContainerCount: 0,
      recommendationContainerCount: 0, recentViewContainerCount: 0, promotedDetailLinkCount: 0,
      rejectedDetailLinkCount: 0, numericLinksInsideKnownResultRoots: count,
      numericLinksOutsideKnownResultRoots: 0, noResultMarkerCount: 0, loginMarkerCount: 0,
      captchaMarkerCount: 0, verificationMarkerCount: 0, accessDeniedMarkerCount: 0 },
    rejectionReasonCounts: {}, promotionSignalCounts: {}, ordinaryCandidates, promotedCandidates: [], rejectedCandidates: [],
    diagnosticSamples: { ordinary: [], promoted: [], rejected: [], ordinaryTruncated: false,
      promotedTruncated: false, rejectedTruncated: false },
    containerSignatures: [], containerSignaturesTruncated: false, diagnostics: [],
  };
  return validateAndRoundTripJobKoreaSnapshot({ ...base, ...overrides, evidence: { ...base.evidence, ...overrides.evidence } });
}
