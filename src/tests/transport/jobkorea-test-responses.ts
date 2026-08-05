export const robotsAllow = () => new Response("User-agent: *\nAllow: /Search/\nAllow: /recruit/joblist\n", { status: 200, headers: { "content-type": "text/plain" } });
export const robotsBlock = () => new Response("User-agent: *\nDisallow: /Search/\n", { status: 200, headers: { "content-type": "text/plain" } });
export const syntheticPhone = ["010", "0000", "0000"].join("-");
export const syntheticEmail = ["contact", "example.invalid"].join("@");

export function listingHtml(ids: string[] = ["101", "102", "103"]): string {
  return `<!doctype html><html><body>${ids.map((id) => `<a href="/Recruit/GI_Read/${id}?logpath=tracking">공개 물류 공고 ${id}</a>`).join("")}</body></html>`;
}

export function detailHtml(id: string, title = `공개 물류 공고 ${id}`, salary = "월급 280만원"): string {
  return `<!doctype html><html><body><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting", identifier: { value: id }, url: `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`,
    title, hiringOrganization: { name: `공개회사 ${id}` }, datePosted: "2026-08-05", validThrough: "2026-09-05",
    employmentType: "정규직", experienceRequirements: "경력무관", educationRequirements: "학력무관",
    baseSalary: { currency: "KRW", value: { value: 2_800_000, unitText: "MONTH" } },
    jobLocation: [{ address: { streetAddress: "서울 강남구 테헤란로 1", addressRegion: "서울", addressLocality: "역삼동" } }],
    description: `전체 설명과 지원자 정보 ${syntheticPhone} ${syntheticEmail}`,
  })}</script><div>${salary}</div><div>담당자 가상담당 ${syntheticPhone} ${syntheticEmail}</div></body></html>`;
}

export const htmlResponse = (body: string, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders } });
