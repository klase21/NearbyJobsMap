import { describe, expect, it } from "vitest";
import { normalizeSalary } from "../../services/salary-normalizer";
import { parseSalary } from "../../services/salary-parser";

describe("한국어 급여 파서", () => {
  it.each([
    ["3,000~4,300만원", "annual", 30_000_000, 43_000_000],
    ["4,516만원 이상", "annual", 45_160_000, null],
    ["3,240~3,400만원", "annual", 32_400_000, 34_000_000],
    ["270~300만원(월)", "monthly", 2_700_000, 3_000_000],
    ["300~316만원(월)", "monthly", 3_000_000, 3_160_000],
    ["280만원 이상(월)", "monthly", 2_800_000, null],
    ["700~750만원(월)", "monthly", 7_000_000, 7_500_000],
  ] as const)("JobKorea listing salary %s", (input, type, minimum, maximum) => {
    const parsed = parseSalary(input, { bareManwonPeriod: "annual" });
    expect(parsed).toMatchObject({ originalText: input, type, minimumAmount: minimum, maximumAmount: maximum });
  });

  it.each([
    ["시급 13,500원", "hourly", 13_500, 13_500],
    ["일급 150,000원", "daily", 150_000, 150_000],
    ["주급 700,000원", "weekly", 700_000, 700_000],
    ["월급 280만원", "monthly", 2_800_000, 2_800_000],
    ["월 250만~320만원", "monthly", 2_500_000, 3_200_000],
    ["연봉 3,800만원", "annual", 38_000_000, 38_000_000],
    ["연 3,500만~4,500만원", "annual", 35_000_000, 45_000_000],
    ["건별 50,000원", "per_task", 50_000, 50_000],
  ] as const)("%s", (input, type, minimum, maximum) => {
    const parsed = parseSalary(input);
    expect(parsed.originalText).toBe(input);
    expect(parsed.type).toBe(type);
    expect(parsed.minimumAmount).toBe(minimum);
    expect(parsed.maximumAmount).toBe(maximum);
  });

  it("연봉 이상 표현은 보장되지 않은 상한을 만들지 않는다", () => {
    const parsed = parseSalary("연 4,000만원 이상");
    expect(parsed.type).toBe("annual");
    expect(parsed.minimumAmount).toBe(40_000_000);
    expect(parsed.maximumAmount).toBeNull();
    expect(normalizeSalary(parsed).normalizedMonthlyMinimum).toBeNull();
  });

  it("회사 내규를 0으로 만들지 않는다", () => {
    const parsed = parseSalary("회사 내규에 따름");
    expect(parsed.type).toBe("company_policy");
    expect(parsed.minimumAmount).toBeNull();
    expect(parsed.currency).toBeNull();
  });

  it("면접 후 결정을 추정 금액으로 만들지 않는다", () => {
    const parsed = parseSalary("면접 후 결정");
    expect(parsed.type).toBe("negotiable");
    expect(parsed.negotiable).toBe(true);
    expect(parsed.minimumAmount).toBeNull();
  });

  it("기본급과 인센티브를 mixed로 보존한다", () => {
    const parsed = parseSalary("  기본급 280만원   + 인센티브 ");
    expect(parsed.originalText).toBe("  기본급 280만원   + 인센티브 ");
    expect(parsed.type).toBe("mixed");
    expect(parsed.minimumAmount).toBe(2_800_000);
    expect(parsed.includesIncentive).toBe(true);
    expect(normalizeSalary(parsed).normalizedMonthlyMinimum).toBeNull();
  });

  it("지원하지 않는 표현은 보수적으로 unknown을 반환한다", () => {
    const parsed = parseSalary("업무 난이도에 따라 차등 지급");
    expect(parsed.type).toBe("unknown");
    expect(parsed.minimumAmount).toBeNull();
  });
});

describe("월 환산", () => {
  it("정책 값을 명시적으로 적용한다", () => {
    const normalized = normalizeSalary(parseSalary("시급 10,000원"), { monthlyHours: 200, monthlyWorkDays: 20, annualMonths: 12 });
    expect(normalized.normalizedMonthlyMinimum).toBe(2_000_000);
    expect(normalized.normalizationBasis).toBe("시급 × 월 200시간");
    expect(normalized.normalizationConfidence).toBe("medium");
  });

  it("일급 환산은 낮은 신뢰도로 표시한다", () => {
    const normalized = normalizeSalary(parseSalary("일급 100,000원"));
    expect(normalized.normalizedMonthlyMinimum).toBe(2_200_000);
    expect(normalized.normalizationConfidence).toBe("low");
  });

  it("연봉 환산은 세전 월 비교용 메타데이터다", () => {
    const normalized = normalizeSalary(parseSalary("연봉 36,000,000원"));
    expect(normalized.normalizedMonthlyMinimum).toBe(3_000_000);
    expect(normalized.originalText).toBe("연봉 36,000,000원");
  });

  it("별도 인센티브가 있는 연봉 환산은 낮은 신뢰도로 표시한다", () => {
    const normalized = normalizeSalary(parseSalary("연봉 3,600만원 + 인센티브 별도"));
    expect(normalized.normalizedMonthlyMinimum).toBe(3_000_000);
    expect(normalized.normalizationConfidence).toBe("low");
    expect(normalized.includesIncentive).toBe(true);
  });
});
