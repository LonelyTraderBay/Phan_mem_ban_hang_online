import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.spec.ts", "packages/**/*.test.ts", "modules/**/*.test.ts"],
    globals: true,
    passWithNoTests: false,
    coverage: {
      // Reporting only — no `thresholds` yet. Run `pnpm test:coverage` to get a baseline
      // before deciding per-package/module gates; most modules have zero tests today.
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["apps/**/src/**", "packages/**/src/**", "modules/**/src/**"],
      exclude: ["**/*.d.ts"]
    }
  },
  resolve: {
    alias: {
      "@ai-sales/auth-context": new URL("./packages/auth-context/src/index.ts", import.meta.url).pathname,
      "@ai-sales/config": new URL("./packages/config/src/index.ts", import.meta.url).pathname,
      "@ai-sales/contracts-events": new URL("./packages/contracts-events/src/index.ts", import.meta.url).pathname,
      "@ai-sales/contracts-http": new URL("./packages/contracts-http/src/index.ts", import.meta.url).pathname,
      "@ai-sales/database": new URL("./packages/database/src/index.ts", import.meta.url).pathname,
      "@ai-sales/domain-kernel": new URL("./packages/domain-kernel/src/index.ts", import.meta.url).pathname,
      "@ai-sales/idempotency": new URL("./packages/idempotency/src/index.ts", import.meta.url).pathname,
      "@ai-sales/observability": new URL("./packages/observability/src/index.ts", import.meta.url).pathname,
      "@ai-sales/outbox": new URL("./packages/outbox/src/index.ts", import.meta.url).pathname,
      "@ai-sales/security": new URL("./packages/security/src/index.ts", import.meta.url).pathname,
      "@ai-sales/test-utils": new URL("./packages/test-utils/src/index.ts", import.meta.url).pathname,
      "@ai-sales/module-audit": new URL("./modules/audit/src/index.ts", import.meta.url).pathname,
      "@ai-sales/module-identity": new URL("./modules/identity/src/index.ts", import.meta.url).pathname
    }
  }
});
