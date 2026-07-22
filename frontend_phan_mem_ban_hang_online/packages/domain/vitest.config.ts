import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // `coverage.include` makes the denominator every source file, not just files a test happens
    // to import — otherwise an untested file silently doesn't count against the threshold at
    // all. Modest floor (spec: "threshold khởi điểm khiêm tốn" — F00 is scaffold, a high bar now
    // would just be gaming the metric).
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/generated/**"],
      thresholds: { lines: 20, statements: 20, functions: 20, branches: 20 },
    },
  },
});
