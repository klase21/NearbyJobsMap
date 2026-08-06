import type { AlbamonListingPageResult } from "./albamon-collection-types";

export const ALBAMON_LISTING_EVALUATOR_SOURCE = String.raw`(() => {
  const clean = (value, max = 160) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
  const hrefValue = (anchor) => {
    try { const raw = anchor.getAttribute("href"); return typeof raw === "string" ? raw : ""; } catch { return ""; }
  };
  const detail = (value) => {
    try {
      const url = new URL(value, "https://www.albamon.com");
      if (url.protocol !== "https:" || !["www.albamon.com", "m.albamon.com"].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^\/jobs\/detail\/(\d+)\/?$/);
      return match ? { id: match[1], url: "https://www.albamon.com/jobs/detail/" + match[1] } : null;
    } catch { return null; }
  };
  const anchors = Array.from(document.querySelectorAll("a")).map((anchor, position) => ({ anchor, position, detail: detail(hrefValue(anchor)) })).filter((item) => item.detail);
  const rootSelector = "[data-testid*='job-list' i], [data-testid*='recruit-list' i], [id*='job-list' i], [class*='job-list' i], [class*='recruit-list' i], [class*='list-recruit' i]";
  const preferredRoots = Array.from(document.querySelectorAll(rootSelector)).map((root) => ({ root, count: new Set(Array.from(root.querySelectorAll("a")).map((a) => detail(hrefValue(a))?.id).filter(Boolean)).size })).filter((item) => item.count > 0).sort((a,b) => b.count - a.count);
  const resultRoot = preferredRoots[0]?.root || (anchors.length ? document.querySelector("main") : null);
  const withinRoot = resultRoot ? anchors.filter((item) => resultRoot.contains(item.anchor)) : [];
  const tokens = (element) => {
    try { return Array.from(element.classList || []).map((value) => String(value).toLowerCase()); } catch { return []; }
  };
  const semanticNode = (card, patterns) => {
    const nodes = [card, ...Array.from(card.querySelectorAll("[class], [data-testid], [aria-label]"))].slice(0, 200);
    for (const node of nodes) {
      const evidence = [...tokens(node), clean(node.getAttribute && node.getAttribute("data-testid"), 80).toLowerCase(), clean(node.getAttribute && node.getAttribute("aria-label"), 80).toLowerCase()];
      if (evidence.some((value) => patterns.some((pattern) => pattern.test(value)))) {
        const value = clean(node.textContent, 200); if (value) return { node, value };
      }
    }
    return null;
  };
  const semanticText = (card, patterns) => semanticNode(card, patterns)?.value || null;
  const leafTexts = (card) => Array.from(card.querySelectorAll("a, span, strong, b, p, em, dt, dd, div"))
    .filter((node) => node.childElementCount === 0).slice(0, 120).map((node) => clean(node.textContent, 200)).filter(Boolean);
  const idsIn = (element) => Array.from(new Set(Array.from(element.querySelectorAll("a")).map((a) => detail(hrefValue(a))?.id).filter(Boolean)));
  const repeatedSinglePostingSiblings = (element) => {
    const parent = element.parentElement; if (!parent || parent.children.length < 2 || parent.children.length > 100) return false;
    return Array.from(parent.children).filter((child) => idsIn(child).length === 1).length >= 2;
  };
  const candidateFor = (item) => {
    let current = item.anchor; let card = null;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      if (["HTML", "BODY", "MAIN", "HEADER", "FOOTER", "NAV"].includes(current.tagName)) break;
      const currentIds = idsIn(current);
      if (currentIds.length === 1 && currentIds[0] === item.detail.id && (current.matches("li, article, tr, [data-testid*='job-card'], [data-testid*='job-item'], [class~='job-item'], [class~='recruit-item']") || repeatedSinglePostingSiblings(current))) { card = current; break; }
    }
    if (!card || !resultRoot || !resultRoot.contains(card) || card === resultRoot) return null;
    const cardDetails = Array.from(card.querySelectorAll("a")).map((a) => detail(hrefValue(a))).filter(Boolean);
    const ids = Array.from(new Set(cardDetails.map((value) => value.id)));
    if (ids.length !== 1 || ids[0] !== item.detail.id) return null;
    const sameAnchors = Array.from(card.querySelectorAll("a")).filter((a) => detail(hrefValue(a))?.id === item.detail.id);
    const titleAnchor = sameAnchors.map((a) => ({ text: clean(a.textContent, 200), a })).find((entry) => entry.text);
    const title = titleAnchor?.text || semanticText(card, [/^(?:title|subject|job-title|recruit-title)$/]);
    const leaves = leafTexts(card);
    const companyAnchor = Array.from(card.querySelectorAll("a")).find((a) => !detail(hrefValue(a)) && /\/(?:company|enterprise|brand|corp)(?:\/|$)/i.test(hrefValue(a)) && clean(a.textContent, 120));
    const excludedField = (text) => text === title || /(?:서울|경기|인천|[가-힣]+(?:시|군|구))/.test(text) || /(?:시급|일급|월급|연봉|원|마감|D-\d+|주\s*\d일|\d{1,2}:\d{2})/i.test(text);
    const companySemantic = semanticNode(card, [/(?:^|-|_)(?:company|corp|enterprise|business|brand)(?:$|-|_)/]);
    const company = companySemantic?.value || clean(companyAnchor && companyAnchor.textContent, 120) || leaves.find((text) => !excludedField(text) && !/^(?:지원|스크랩|상세보기|바로가기)$/.test(text)) || null;
    if (!title || !company) return { invalid: true, id: item.detail.id };
    const fieldLeaves = leaves.filter((text) => text !== title && text !== company);
    const fieldText = (patterns) => { const value = semanticText(card, patterns); return value && value !== title && value !== company && !(value.includes(title) && value.includes(company)) ? value : null; };
    let locationContaminationRejected = false;
    const locationText = (() => {
      const patterns = [/(?:^|-|_)(?:location|region|area|address|workplace)(?:$|-|_)/];
      const nodes = Array.from(card.querySelectorAll("[class], [data-testid], [aria-label]")).slice(0, 200);
      for (const node of nodes) {
        const evidence = [...tokens(node), clean(node.getAttribute && node.getAttribute("data-testid"), 80).toLowerCase(), clean(node.getAttribute && node.getAttribute("aria-label"), 80).toLowerCase()];
        if (!evidence.some((value) => patterns.some((pattern) => pattern.test(value)))) continue;
        const value = clean(node.textContent, 200);
        const containsTitleNode = Boolean(titleAnchor?.a && (node === titleAnchor.a || node.contains(titleAnchor.a)));
        const containsCompanyNode = Boolean((companySemantic?.node && (node === companySemantic.node || node.contains(companySemantic.node))) || (companyAnchor && (node === companyAnchor || node.contains(companyAnchor))));
        const containsJobIdentity = value === title || value === company || value.includes(title) || value.includes(company);
        const unrelatedSignals = [/(?:salary|pay|wage)/i, /\d{1,2}:\d{2}/, /D-\d+|deadline/i].filter((pattern) => pattern.test(value)).length;
        if (!value || containsTitleNode || containsCompanyNode || containsJobIdentity || unrelatedSignals > 1) {
          locationContaminationRejected = true;
          continue;
        }
        return value;
      }
      return null;
    })();
    return { invalid: false, id: item.detail.id, url: item.detail.url, title, companyName: company,
      regionText: locationText, locationContaminationRejected,
      salaryText: fieldText([/(?:^|-|_)(?:salary|pay|wage)(?:$|-|_)/]) || fieldLeaves.find((text) => /(?:시급|일급|주급|월급|연봉|건별)\s*[\d,]+원|급여\s*협의/.test(text)) || null,
      employmentType: fieldText([/(?:^|-|_)(?:employment|job-type|work-type)(?:$|-|_)/]) || fieldLeaves.find((text) => /^(?:아르바이트|파트타임|정규직|계약직|인턴)$/.test(text)) || null,
      workDaysText: fieldText([/(?:^|-|_)(?:work-days|weekday|schedule)(?:$|-|_)/]) || fieldLeaves.find((text) => /(?:주\s*\d일|월.?금|요일)/.test(text)) || null,
      workHoursText: fieldText([/(?:^|-|_)(?:work-hours|hours|time)(?:$|-|_)/]) || fieldLeaves.find((text) => /\d{1,2}:\d{2}\s*(?:~|-|부터)/.test(text)) || null,
      postingDate: fieldText([/(?:^|-|_)(?:posted|register|date)(?:$|-|_)/]) || fieldLeaves.find((text) => /^(?:오늘|어제|\d{2}\.\d{2})$/.test(text)) || null,
      deadlineText: fieldText([/(?:^|-|_)(?:deadline|due|closing)(?:$|-|_)/]) || fieldLeaves.find((text) => /(?:마감|D-\d+|채용시)/.test(text)) || null,
      categoryLabels: [], sourcePosition: item.position, observedLinkCount: sameAnchors.length };
  };
  const grouped = new Map(); let invalidCards = 0;
  for (const item of withinRoot) {
    if (grouped.has(item.detail.id)) continue;
    const candidate = candidateFor(item); if (!candidate || candidate.invalid) { if (candidate?.invalid) invalidCards += 1; continue; }
    grouped.set(item.detail.id, candidate);
  }
  const visible = (element) => {
    if (!element || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden";
  };
  const noResultPattern = /검색 결과가 없습니다|등록된 공고가 없습니다|공고가 없습니다/;
  const noResultRoots = Array.from(document.querySelectorAll("[data-testid*='empty' i], [data-testid*='no-result' i], [class*='empty-result' i], [class*='no-result' i], [class*='no_data' i], [class*='nodata' i]"));
  const main = document.querySelector("main");
  const explicitNoResult = noResultRoots.some((node) => main?.contains(node) && visible(node) && noResultPattern.test(clean(node.textContent, 500))) ||
    (!anchors.length && visible(main) && noResultPattern.test(clean(main.innerText, 500)));
  const bodyText = clean(document.body && document.body.innerText, 4000).toLowerCase();
  const login = /로그인|login/.test(document.title.toLowerCase()) && /login|member/.test(location.pathname.toLowerCase());
  const verification = /본인.?확인|verification|verify/.test(bodyText);
  const captcha = /captcha|자동입력|로봇이 아닙니다/.test(bodyText);
  const accessDenied = /access denied|접근이 제한|요청을 처리할 수 없습니다/.test(bodyText);
  const noResults = explicitNoResult;
  return { schemaVersion: 1, finalUrl: String(location.href), title: clean(document.title, 200), readyState: ["loading","interactive","complete"].includes(document.readyState) ? document.readyState : "unknown",
    numericLinkCount: withinRoot.length, resultRootFound: Boolean(resultRoot), login, verification, captcha, accessDenied, noResults,
    invalidCardCount: invalidCards, candidates: Array.from(grouped.values()).sort((a,b) => a.sourcePosition - b.sourcePosition) };
})()`;

interface EvaluatedPage {
  schemaVersion: 1; finalUrl: string; numericLinkCount: number; resultRootFound: boolean; login: boolean; verification: boolean;
  captcha: boolean; accessDenied: boolean; noResults: boolean; invalidCardCount: number;
  candidates: Array<{ id: string; url: string; title: string; companyName: string; regionText: string | null; salaryText: string | null;
    employmentType: string | null; workDaysText: string | null; workHoursText: string | null; postingDate: string | null;
    deadlineText: string | null; categoryLabels: string[]; sourcePosition: number; observedLinkCount: number; locationContaminationRejected?: boolean }>;
}

export function toAlbamonListingPageResult(value: unknown, pageNumber: number, requestedUrl: string): AlbamonListingPageResult {
  if (!value || typeof value !== "object" || (value as { schemaVersion?: unknown }).schemaVersion !== 1) {
    return { pageNumber, requestedUrl, finalUrl: null, classification: "malformed", extractedNumericLinkCount: 0, uniquePostingIdCount: 0,
      uniqueNewPostingIdCount: 0, sourceReportsNoResults: false, blocked: false, parserFailure: true, validEmptyPage: false, invalidCardCount: 0, candidates: [], diagnosticCodes: ["ALBAMON_LISTING_EVALUATION_INVALID"] };
  }
  const data = value as EvaluatedPage;
  const blocked = Boolean(data.login || data.verification || data.captcha || data.accessDenied);
  const classification = data.login ? "login" : data.verification ? "verification" : data.captcha ? "captcha" : data.accessDenied ? "access_denied"
    : data.candidates.length ? "valid_results" : data.noResults ? "valid_empty" : "malformed";
  return { pageNumber, requestedUrl, finalUrl: typeof data.finalUrl === "string" ? data.finalUrl : null, classification,
    extractedNumericLinkCount: Number.isInteger(data.numericLinkCount) && data.numericLinkCount >= 0 ? data.numericLinkCount : 0,
    uniquePostingIdCount: data.candidates.length, uniqueNewPostingIdCount: 0, sourceReportsNoResults: Boolean(data.noResults), blocked,
    parserFailure: classification === "malformed", validEmptyPage: classification === "valid_empty", invalidCardCount: Number.isInteger(data.invalidCardCount) ? data.invalidCardCount : 0, candidates: data.candidates.map((item) => ({
      sourcePostingId: item.id, canonicalUrl: item.url, title: item.title, companyName: item.companyName, regionText: item.regionText,
      salaryText: item.salaryText, employmentTypes: item.employmentType ? [item.employmentType] : [], workDaysText: item.workDaysText,
      workHoursText: item.workHoursText, postingDate: item.postingDate, deadlineText: item.deadlineText, categoryLabels: item.categoryLabels,
      firstSourcePosition: item.sourcePosition, observedLinkCount: item.observedLinkCount,
      locationContaminationRejected: item.locationContaminationRejected === true })),
    diagnosticCodes: [...(data.invalidCardCount ? ["ALBAMON_LISTING_CARD_INVALID"] : []), ...(classification === "malformed" ? ["ALBAMON_LISTING_PAGE_MALFORMED"] : [])] };
}
