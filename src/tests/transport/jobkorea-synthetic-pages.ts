const document = (body: string, title = "잡코리아 합성 검색") => `<!doctype html><html><head>
  <meta charset="utf-8"><base href="https://www.jobkorea.co.kr/Search?stext=AI"><title>${title}</title>
  </head><body>${body}</body></html>`;

const row = (id: string, href = `/Recruit/GI_Read/${id}`, extra = "") => `<tr class="devloopArea" data-gno="${id}"><td>
  <span class="company">가상회사 ${id}</span><a href="${href}">가상 공고 ${id}</a>${extra}
  </td></tr>`;

const structuralCard = (id: number, linkCount: 1 | 2 | 3 = 3, className = "flex gap-5 p-7 w-full") => `<div class="${className}">
  <div class="mb-0.5"><a href="/Recruit/GI_Read/${id}?logpath=title">Synthetic title link</a></div>
  <div class="w-full">${linkCount >= 2 ? `<a href="https://www.jobkorea.co.kr/Recruit/GI_Read/${id}">Synthetic company link</a>` : "<span>company slot</span>"}</div>
  <div class="actions">${linkCount >= 3 ? `<a href="/Recruit/GI_Read/${id}?utm_source=synthetic">Synthetic action link</a>` : "<span>action slot</span>"}</div>
</div>`;

export const syntheticJobKoreaPages = {
  validSearch: document(`<main><table class="recruit-list">${row("50000001")}${row("50000002")}</table></main>`),
  promotedAndOrdinary: document(`<main><table class="recruit-list">${row("50000001")}
    <tr class="devloopArea ad-row" data-gno="50000003"><td>AD <a href="/Recruit/GI_Read/50000003">가상 광고</a></td></tr>
    </table><section class="recommend-list">지금 주목할 만한 공고 <a href="/Recruit/GI_Read/50000004">가상 추천</a></section>
    <div><a href="/Recruit/GI_Read/50000005">일반 영역 밖 링크</a></div></main>`),
  duplicates: document(`<main><table class="recruit-list">${row("50000001")}${row("50000001")}
    ${row("50000001", "https://www.jobkorea.co.kr/Recruit/GI_Read/50000001?logpath=tracking")}</table></main>`),
  validEmpty: document(`<main class="recruit-list"><p>검색 결과가 없습니다.</p></main>`),
  login: document(`<main><h1>회원 로그인</h1><p>로그인이 필요합니다.</p></main>`, "로그인"),
  verification: document(`<main><h1>보안 확인 verification</h1></main>`, "보안 확인"),
  captcha: document(`<main><h1>CAPTCHA 자동입력 방지</h1></main>`, "자동입력 방지"),
  accessDenied: document(`<main><h1>Access Denied</h1><p>접근이 차단되었습니다.</p></main>`, "접근 차단"),
  malformedResults: document(`<main><table class="recruit-list"><tr class="devloopArea" data-gno="bad"><td>
    <a href="/Recruit/GI_Read/not-a-number">잘못된 가상 공고</a></td></tr></table></main>`),
  recommendationOnly: document(`<main><section class="recommend-list">지금 주목할 만한 공고
    <a href="/Recruit/GI_Read/50000004">가상 추천 1</a><a href="/Recruit/GI_Read/50000005">가상 추천 2</a>
    </section></main>`),
  nonHtmlAnchor: document(`<main class="recruit-list"><svg><a href="/Recruit/GI_Read/50000006"><text>가상 SVG 링크</text></a></svg></main>`),
  newCardBased: document(`<main data-section="recruit-search-results"><div class="results-grid">
    <article class="recruit-card" data-gno="50001001"><a class="posting-link primary" data-type="job" href="/Recruit/GI_Read/50001001">가상 카드 공고</a></article>
  </div></main>`),
  listItemBased: document(`<main data-section="recruit-search-results"><ul class="job-list">
    <li class="job-item" data-gno="50001002"><a href="/Recruit/GI_Read/50001002">가상 목록 공고</a></li>
  </ul></main>`),
  genericNestedDiv: document(`<main data-section="recruit-search-results"><div class="search-shell" data-tab="recruit">
    <div class="result-group" data-section="jobs"><div class="unknown-card" data-recruit-no="50001003">
      <a data-type="posting" href="/Recruit/GI_Read/50001003">가상 중첩 공고</a>
    </div></div></div></main>`),
  promotedAndUnknownCards: document(`<main data-section="recruit-search-results"><div class="results-grid">
    <article class="ad-card" data-gno="50001004">AD <a href="/Recruit/GI_Read/50001004">가상 광고</a></article>
    <article class="unknown-card" data-gno="50001005"><a href="/Recruit/GI_Read/50001005">가상 미확인 카드</a></article>
  </div></main>`),
  outsideResultRoot: document(`<div class="detached-widget"><a href="/Recruit/GI_Read/50001006">가상 루트 밖 공고</a></div>`),
  measuredShape88: document(`<main data-section="synthetic-measured-shape"><div class="synthetic-grid">
    ${Array.from({ length: 28 }, (_, index) => `<article class="ad-card" data-gno="${51000000 + index}">AD <a href="/Recruit/GI_Read/${51000000 + index}">가상 광고</a></article>`).join("")}
    ${Array.from({ length: 60 }, (_, index) => `<article class="synthetic-unknown-card" data-gno="${52000000 + index}"><a href="/Recruit/GI_Read/${52000000 + index}">가상 미확인 공고</a></article>`).join("")}
  </div></main>`),
  signatureSanitization: document(`<main data-section="recruit-search-results"><article class="zeta alpha beta gamma delta epsilon eta theta iota kappa" data-gno="50002001" data-track="${"x".repeat(150)}" data-secret="must-not-cross">
    <a class="zeta alpha beta gamma delta epsilon eta theta iota" data-type="posting" data-secret="hidden" href="/Recruit/GI_Read/50002001">민감하지 않은 가상 제목</a>
  </article></main>`),
  manyContainerSignatures: document(`<main data-section="recruit-search-results">${Array.from({ length: 25 }, (_, index) =>
    `<article class="unknown-shape-${index}" data-gno="${53000000 + index}"><a href="/Recruit/GI_Read/${53000000 + index}">가상 공고</a></article>`).join("")}</main>`),
  deepAncestors: document(`<main data-section="recruit-search-results">${"<div>".repeat(12)}<a href="/Recruit/GI_Read/54000001">가상 공고</a>${"</div>".repeat(12)}</main>`),
  genericPromotionFalsePositives: document(`<main data-section="recruit-search-results">${[
    "shadow", "shadow-sm", "leading", "loading", "header", "gradient", "badge",
    "card", "rounded", "standard", "data-grid", "job-card", "recruit-card",
  ].map((className, index) => `<div class="${className}"><a href="/Recruit/GI_Read/${55000000 + index}">가상 공고</a></div>`).join("")}</main>`),
  explicitPromotionSignals: document(`<main data-section="recruit-search-results">
    <div class="ad"><a href="/Recruit/GI_Read/56000001">가상 광고</a></div>
    <div class="sponsored"><a href="/Recruit/GI_Read/56000002">가상 광고</a></div>
    <div class="promoted"><a href="/Recruit/GI_Read/56000003">가상 광고</a></div>
    <div class="ad-item"><a href="/Recruit/GI_Read/56000004">가상 광고</a></div>
    <div data-type="job ad"><a href="/Recruit/GI_Read/56000005">가상 광고</a></div>
    <div data-section="search promoted"><a href="/Recruit/GI_Read/56000006">가상 광고</a></div>
    <div data-track="ad"><a href="/Recruit/GI_Read/56000007">가상 광고</a></div>
    <div>AD<a href="/Recruit/GI_Read/56000008">가상 광고</a></div>
    <div class="PROMOTED"><a href="/Recruit/GI_Read/56000009">가상 광고</a></div>
  </main>`),
  nonPromotionDataValues: document(`<main data-section="recruit-search-results">
    <div data-type="standard"><a href="/Recruit/GI_Read/57000001">가상 공고</a></div>
    <div data-section="header"><a href="/Recruit/GI_Read/57000002">가상 공고</a></div>
    <div data-track="load"><a href="/Recruit/GI_Read/57000003">가상 공고</a></div>
    <div data-track="opaque-analytics-value"><a href="/Recruit/GI_Read/57000004">가상 공고</a></div>
  </main>`),
  boundedPromotionScope: document(`<main aria-label="Sponsored" data-section="recruit-search-results">
    <div class="ad">${"<div>".repeat(6)}<a href="/Recruit/GI_Read/58000001">깊은 가상 공고</a>${"</div>".repeat(6)}</div>
    <section><div><a href="/Recruit/GI_Read/58000002">페이지 라벨과 무관한 공고</a></div></section>
  </main>`),
  mixedPromotionScope: document(`<main data-section="recruit-search-results"><table class="recruit-list">${row("59000001")}</table>
    <div class="ad-item"><a href="/Recruit/GI_Read/59000002">가상 광고</a></div>
    <div class="shadow-sm"><a href="/Recruit/GI_Read/59000003">가상 미확인 공고</a></div>
  </main>`),
  svgGenericClass: document(`<main data-section="recruit-search-results"><svg class="shadow-sm"><foreignObject>
    <div xmlns="http://www.w3.org/1999/xhtml"><a href="/Recruit/GI_Read/59000004">Synthetic SVG wrapper posting</a></div>
  </foreignObject></svg></main>`),
  recommendationAndRecent: document(`<main data-section="recruit-search-results">
    <section class="recommend-list"><a href="/Recruit/GI_Read/59000005">Synthetic related posting</a></section>
    <section class="recent-list"><a href="/Recruit/GI_Read/59000006">Synthetic recent posting</a></section>
  </main>`),
  structuralMeasuredShape88: document(`<main data-section="synthetic-structural-shape"><div class="results-shell">
    ${Array.from({ length: 28 }, (_, index) => structuralCard(60000000 + index, 3)).join("")}
    ${Array.from({ length: 2 }, (_, index) => structuralCard(60000028 + index, 2)).join("")}
  </div></main>`),
  repeatedSingleLinkCards: document(`<main data-section="synthetic-single-link"><div class="results-shell">
    ${Array.from({ length: 3 }, (_, index) => structuralCard(61000000 + index, 1)).join("")}
  </div></main>`),
  twoSingleLinkCards: document(`<main data-section="synthetic-two-link"><div class="results-shell">
    ${Array.from({ length: 2 }, (_, index) => structuralCard(62000000 + index, 1)).join("")}
  </div></main>`),
  broadMixedIdWrapper: document(`<main data-section="synthetic-broad"><div class="broad-wrapper">
    ${Array.from({ length: 5 }, (_, index) => `<a href="/Recruit/GI_Read/${63000000 + index}">Synthetic link</a>`).join("")}
  </div></main>`),
  repeatedMixedIdSiblings: document(`<main data-section="synthetic-mixed"><div class="results-shell">
    ${Array.from({ length: 3 }, (_, index) => `<div class="mixed-card"><a href="/Recruit/GI_Read/${64000000 + index * 2}">A</a><a href="/Recruit/GI_Read/${64000001 + index * 2}">B</a></div>`).join("")}
  </div></main>`),
  splitPostingGroup: document(`<main data-section="synthetic-split"><div class="results-shell">
    <div class="split-card"><a href="/Recruit/GI_Read/65000001">First</a></div>
    <div class="split-card"><a href="/Recruit/GI_Read/65000001">Second</a></div>
    <div class="split-card"><a href="/Recruit/GI_Read/65000002">Peer</a></div>
  </div></main>`),
  largeSplitPostingGroup: document(`<main data-section="synthetic-large-split"><div class="results-shell">
    <div class="split-card"><a href="/Recruit/GI_Read/65000101">First</a></div>
    ${Array.from({ length: 201 }, (_, index) => `<span data-id="padding-${index}"></span>`).join("")}
    <div class="split-card"><a href="/Recruit/GI_Read/65000101">Second</a></div>
    <div class="split-card"><a href="/Recruit/GI_Read/65000102">Peer</a></div>
  </div></main>`),
  mixedStructuralExclusions: document(`<main data-section="synthetic-exclusions"><div class="results-shell">
    ${Array.from({ length: 3 }, (_, index) => structuralCard(66000000 + index, 1)).join("")}
    <div class="ad"><a href="/Recruit/GI_Read/66000100">Promoted</a></div>
    <section class="recommend-list"><a href="/Recruit/GI_Read/66000101">Recommended</a></section>
    <section class="recent-list"><a href="/Recruit/GI_Read/66000102">Recent</a></section>
    <div class="mixed-card"><a href="/Recruit/GI_Read/66000103">Mixed A</a><a href="/Recruit/GI_Read/66000104">Mixed B</a></div>
  </div></main>`),
  pageLevelGroups: document(`<main data-section="synthetic-page-level">
    <a href="/Recruit/GI_Read/67000001">Page-level A</a><a href="/Recruit/GI_Read/67000002">Page-level B</a>
  </main>`),
  manyStructuralGroups: document(`<main data-section="synthetic-many-groups"><div class="results-shell">
    ${Array.from({ length: 45 }, (_, index) => `<article class="shape-${index}"><a href="/Recruit/GI_Read/${68000000 + index}">Synthetic</a></article>`).join("")}
  </div></main>`),
} as const;
