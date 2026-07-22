<!--
Template for a Design AI Agent design-spec document (substitutes for a Figma handoff, spec §7.7).
Copy this file to `<route-slug>.md` in this same directory and fill every section — don't leave a
section as the template placeholder text. See `frontend/.claude/agents/design-spec-writer.md` for
the full authoring instructions.
-->

# Design spec: `<route>` — `<Screen name>`

**Status:** Drafted — pending Human Owner copy review
**Version:** v1 — `<YYYY-MM-DD>`
**Author:** Design AI Agent
**Route:** `<e.g. /orders/:orderId>`
**Required permission(s):** `<e.g. order.read>`

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | |
| `1440×900` standard | |
| `1920×1080+` large | |
| `1024×720` Windows compact | |

## Layout — happy state

```text
<ASCII sketch or ordered list of every visible element, top to bottom / left to right>
```

## States

### Happy

<what's shown, sample copy `[DRAFT COPY]`>

### Empty

<what's shown when there's no data yet, sample copy `[DRAFT COPY]`>

### Loading

<skeleton/spinner behavior, which `packages/ui` component>

### Error

<which real error code(s) from `contracts/errors/error-catalog.yaml` trigger this, sample copy `[DRAFT COPY]` following spec §7.5's "concrete, not raw error code" rule>

### Forbidden

<which real permission key from `contracts/permissions/permission-matrix.yaml` triggers this, sample copy `[DRAFT COPY]`>

### Conflict

<e.g. optimistic concurrency version mismatch — what's shown, sample copy `[DRAFT COPY]`>

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| | | |

*(Add a row flagged **"MISSING COMPONENT"** if this screen needs something not in the current
`packages/ui` component list — don't invent a one-off.)*

## Accessibility notes (spec §7.4)

- Keyboard flow: <tab order, shortcuts>
- Focus behavior: <initial focus, modal trap/return if applicable>
- `aria-live` regions: <what updates dynamically and needs an announcement>
- Other: <anything screen-specific — drag/drop keyboard fallback, table header semantics, etc.>

## Interaction notes

<hover/click/keyboard/transition behavior, numbered sequence if it's a multi-step interaction>

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|

## Open gaps found while drafting

<Contract gaps → log in `backend/docs/collaboration/contract-gap-board.md` instead of listing here.
Missing `packages/ui` components → listed in the component mapping table above with the MISSING
COMPONENT flag. Anything else genuinely undecided → list here.>
