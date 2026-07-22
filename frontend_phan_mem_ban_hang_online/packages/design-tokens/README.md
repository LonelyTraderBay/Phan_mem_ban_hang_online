# @ai-sales/design-tokens

Single source of truth for color, typography, spacing, radius, shadow, z-index, motion, breakpoint
and density tokens (spec section 7.1).

## PROVISIONAL notice

The values in `src/tokens.ts` are a **placeholder palette** — a neutral enterprise slate/blue set —
chosen so scaffolding is not blocked while waiting for a real Figma/brand handoff (spec section 7.7).

**When real brand tokens arrive**: edit `src/tokens.ts` only. Every consumer (packages/ui,
Storybook, apps) references semantic names (`color.action.primary`), never raw hex values, so no
consumer code needs to change.

## Usage

```ts
import { color, spacing } from "@ai-sales/design-tokens";
```

For CSS, import the generated custom-properties string:

```ts
import { buildCssVariables } from "@ai-sales/design-tokens";
// inject buildCssVariables() into a <style> tag or a global.css at app bootstrap / Storybook preview.
```
