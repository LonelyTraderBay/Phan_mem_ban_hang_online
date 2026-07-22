import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

// Encodes spec section 4.3 "Import boundary" table as enforceable ESLint rules.
// See frontend_doc/00_FRONTEND_IMPLEMENTATION_SPEC_ENTERPRISE_GRADE_v2.0.md section 4.3/4.4.
//
// NOTE: `eslint-plugin-boundaries` (up to and including the 7.0.0 beta, checked at scaffold time)
// throws `context.getFilename is not a function` under ESLint 10's flat-config-only runtime — the
// plugin still calls a legacy Linter API ESLint 10 removed. Rather than pull in a broken dependency,
// the feature-to-feature boundary below is expressed with plain `no-restricted-imports` patterns,
// mirroring backend's `eslint.config.mjs` approach (see ../../../backend/eslint.config.mjs).

const noEnum = {
  selector: "TSEnumDeclaration",
  message: "Do not use TypeScript runtime enums (spec 4.4). Use a string union with `as const` instead."
};

const noDangerousHtmlWithoutJustification = {
  // Allowed only when the JSX attribute is immediately preceded by a `// dangerouslySetInnerHTML:` comment;
  // ESLint's no-restricted-syntax cannot inspect leading comments, so this is enforced by code review +
  // a repo-wide grep in CI (tooling/scripts) rather than a pure AST selector. This selector still flags
  // the common accidental case of passing a non-static-looking expression.
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message:
    "dangerouslySetInnerHTML requires an explanatory `// dangerouslySetInnerHTML: <reason>` comment directly above and security review."
};

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "storybook-static/**",
      "coverage/**",
      "playwright-report/**",
      ".turbo/**",
      "**/src/generated/**",
      "**/src-tauri/target/**",
      "**/src-tauri/gen/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: false }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": ["error", noEnum, noDangerousHtmlWithoutJustification]
    }
  },
  // Features may only be reached through their public index.ts — no deep imports into another
  // feature's internal folders (spec 4.3).
  {
    files: ["apps/*/src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/features/*/api/**",
                "**/features/*/components/**",
                "**/features/*/domain/**",
                "**/features/*/hooks/**",
                "**/features/*/routes/**",
                "**/features/*/schemas/**",
                "**/features/*/state/**",
                "**/features/*/tests/**"
              ],
              message: "Import other features via their public index.ts only, not their internal folders (spec 4.3)."
            }
          ]
        }
      ]
    }
  },
  // packages/ui: may only import design-tokens and i18n (type-only) — never api-client/auth/app features.
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@ai-sales/api-client*", "@ai-sales/auth*", "@ai-sales/realtime*"], message: "packages/ui must stay presentational: receive data via props, not by importing api-client/auth/realtime directly (spec 4.3)." },
            { group: ["**/apps/*", "**/features/**"], message: "packages/ui cannot import app or feature code (spec 4.3)." }
          ]
        }
      ]
    }
  },
  // packages/domain: pure — no React/browser/Tauri.
  {
    files: ["packages/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "react", message: "packages/domain must be framework-free (spec 4.3)." }, { name: "react-dom", message: "packages/domain must be framework-free (spec 4.3)." }], patterns: [{ group: ["@tauri-apps/*"], message: "packages/domain must be framework-free (spec 4.3)." }] }
      ]
    }
  },
  // packages/api-client: no React, no UI, no feature code.
  {
    files: ["packages/api-client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "react", message: "packages/api-client must not depend on React (spec 4.3)." }], patterns: [{ group: ["**/ui/**", "**/features/**"], message: "packages/api-client must not import UI or feature code (spec 4.3)." }] }
      ]
    }
  },
  // packages/realtime: no app UI imports.
  {
    files: ["packages/realtime/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/features/**", "apps/*"], message: "packages/realtime must not import app UI code (spec 4.3)." }] }
      ]
    }
  },
  // Apps: generated API types may only be consumed via the api/*.mapper.ts adapter layer (spec 3.4).
  {
    files: ["apps/*/src/**/*.{ts,tsx}"],
    ignores: ["**/api/*.mapper.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@ai-sales/api-generated*"], message: "UI must not import generated API types directly, except inside an approved api/*.mapper.ts adapter (spec 3.4)." }] }
      ]
    }
  }
];
