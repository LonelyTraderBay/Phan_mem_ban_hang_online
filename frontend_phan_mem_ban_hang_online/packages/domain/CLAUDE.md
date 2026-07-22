# @ai-sales/domain

Pure, framework-free domain primitives — Money and ISO datetime (spec 4.3/4.4). No runtime
dependencies at all (package.json has no `dependencies` field, only devDeps for the shared
tooling) — the smallest, purest package in the workspace. Keep it that way; don't add a runtime
dependency here without a strong reason.

- Never do floating-point arithmetic on money anywhere else in the codebase — `money.ts` is the
  one place that does it (`money`, `addMoney`, `subtractMoney`, `multiplyMoney`, `compareMoney`,
  `isZeroMoney`).
- Dates/times are stored as ISO UTC strings (`IsoDateTime`); format only at the display boundary,
  never store a formatted/local-time string.
