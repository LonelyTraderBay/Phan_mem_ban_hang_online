# @ai-sales/forms

React Hook Form + Zod wrapper and common field validators (spec 3.2, ADR-FE-010).

- **Business-specific validation belongs in each feature's own `schemas/`, not here** — this
  package's own package.json description says so explicitly. Only generic, business-rule-free
  validators live in `src/validators.ts` (e.g. `nonEmptyString`, `emailAddress`, `isoDateString`,
  `nonNegativeInteger`). Don't add a tenant/SKU/domain-specific validator here.
- Validator error messages are in Vietnamese (e.g. "Trường này là bắt buộc.") — matches the
  workspace's vi-VN baseline locale (see `@ai-sales/i18n`).
- No README; the scope rule is stated in both `package.json`'s description and inline in
  `validators.ts`.
