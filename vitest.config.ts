import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts"],
    coverage: { reporter: ["text", "json", "html"] },
  },
});
