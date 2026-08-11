export interface JobKoreaHttpTodayFixtureRow {
  id: string;
  registration: string;
  deadline?: string;
  location?: string;
  company?: string;
  title?: string;
  experience?: string;
  education?: string;
  employment?: string;
  salary?: string;
  positionGrade?: string;
}

export function jobKoreaHttpTodayFixture(rows: JobKoreaHttpTodayFixtureRow[]): string {
  return `<div class="tplJobListWrap"><table><caption>전체 채용정보 목록</caption><tbody>${rows.map((row) => `
    <tr class="devloopArea" data-gno="${row.id}">
      <td class="tplCo"><a href="/Recruit/Co_Read/C/${row.id}">${row.company ?? `가상회사 ${row.id}`}</a></td>
      <td class="tplTit"><strong><a href="/Recruit/GI_Read/${row.id}?logpath=fixture">${row.title ?? `가상 공고 ${row.id}`}</a></strong>
        <p class="etc"><span class="cell">${row.experience ?? "경력무관"}</span><span class="cell">${row.education ?? "학력무관"}</span><span class="cell">${row.location ?? "서울 강남구"}</span><span class="cell">${row.employment ?? "정규직"}</span><span class="cell">${row.salary === undefined ? "월급 300만원" : row.salary}</span><span class="cell">${row.positionGrade ?? ""}</span></p>
      </td>
      <td class="odd"><span class="time dotum">${row.registration}</span><span class="date dotum">${row.deadline ?? "08/20 마감"}</span></td>
    </tr>`).join("")}</tbody></table></div>`;
}
