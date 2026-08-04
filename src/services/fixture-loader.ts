import { readFile } from "node:fs/promises";

const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ["phone", /(?:01[016789]|0\d{1,2})[- )]?\d{3,4}[- ]?\d{4}/],
  ["cookie", /\b(?:set-cookie|cookie)\s*:/i],
  ["authorization", /\bauthorization\s*:/i],
  ["token", /\b(?:access|refresh|session)[_-]?token\b/i],
];

export function inspectFixtureSafety(content: string): string[] {
  return FORBIDDEN_PATTERNS.filter(([, pattern]) => pattern.test(content)).map(([name]) => name);
}

export async function loadFixture<T>(path: URL): Promise<T> {
  const content = await readFile(path, "utf8");
  const violations = inspectFixtureSafety(content);
  if (violations.length) throw new Error(`Fixture safety violation: ${violations.join(", ")}`);
  return JSON.parse(content) as T;
}
