const PUNCTUATION_VARIANCE = /[·ㆍ•|｜/／,，:：;；()[\]{}<>《》「」『』“”‘’'"!?！？]/g;
const DASH_VARIANCE = /[‐‑‒–—―−]/g;

export function normalizeSemanticJobText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko")
    .replace(DASH_VARIANCE, "-")
    .replace(PUNCTUATION_VARIANCE, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function semanticJobGroupKey(company: string, title: string): string {
  return `${normalizeSemanticJobText(company)}\u0000${normalizeSemanticJobText(title)}`;
}
