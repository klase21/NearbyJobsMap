"use client";

interface SummaryStripProps {
  total: number;
  filtered: number;
  exact: number;
  todayOrClosing: number;
  jobKorea: number;
  albamon: number;
}

export function SummaryStrip(props: SummaryStripProps) {
  const stats = [
    ["전체 공고", props.total], ["현재 필터 결과", props.filtered], ["정확한 주소 또는 좌표", props.exact],
    ["오늘 등록 또는 마감 임박", props.todayOrClosing], ["잡코리아", props.jobKorea], ["알바몬", props.albamon],
  ] as const;
  return (
    <section className="summary-strip" aria-label="현재 공고 요약">
      {stats.map(([label, value]) => (
        <div className="summary-card" key={label}>
          <span className="summary-label">{label}</span>
          <strong className="summary-value">{new Intl.NumberFormat("ko-KR").format(value)}</strong>
        </div>
      ))}
    </section>
  );
}
