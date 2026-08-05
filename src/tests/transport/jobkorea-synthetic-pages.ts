const document = (body: string, title = "잡코리아 합성 검색") => `<!doctype html><html><head>
  <meta charset="utf-8"><base href="https://www.jobkorea.co.kr/Search?stext=AI"><title>${title}</title>
  </head><body>${body}</body></html>`;

const row = (id: string, href = `/Recruit/GI_Read/${id}`, extra = "") => `<tr class="devloopArea" data-gno="${id}"><td>
  <span class="company">가상회사 ${id}</span><a href="${href}">가상 공고 ${id}</a>${extra}
  </td></tr>`;

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
} as const;
