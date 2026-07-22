import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const frameworkImports = {
  patterns: [
    {
      group: ["@nestjs/*", "pg", "kysely", "bullmq", "fastify", "axios", "node-fetch"],
      message: "Domain/application code must not import framework, DB, queue, HTTP, or provider SDKs."
    }
  ]
};

const modulePublicApiOnly = {
  patterns: [
    {
      group: ["@ai-sales/module-*/*"],
      message: "Import other modules via public API only (@ai-sales/module-<name>)."
    }
  ]
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", "backend_doc/**", "graphify-out/**", ".gitnexus/**", "hooks/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: false
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": ["error", frameworkImports]
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["apps/**/*.ts", "packages/database/**/*.ts", "packages/idempotency/**/*.ts", "packages/outbox/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  },
  {
    files: ["modules/**/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", modulePublicApiOnly]
    }
  },
  {
    files: ["modules/**/presentation/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", modulePublicApiOnly]
    }
  },
  {
    files: ["modules/**/domain/**/*.ts", "modules/**/application/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...frameworkImports.patterns, ...modulePublicApiOnly.patterns] }]
    }
  },
  {
    files: ["modules/**/index.ts"],
    rules: {
      "no-restricted-imports": ["error", modulePublicApiOnly]
    }
  },
  prettier
];
