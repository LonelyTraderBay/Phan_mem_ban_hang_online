# BE-ORD-002 Order Calculation Algorithm

Status: **authoritative for v1** — computation order (technical) + VAT inputs from Human Owner
defaults (`../business/HO_DEFAULTS_v1.md`, Resolved 2026-07-22): **10% VAT, tax-inclusive prices**.
SIGNOFF billing/VAT rows are Resolved; supersede only via ADR + new HO_DEFAULTS version.

Source: blueprint §7.11.1/§7.11.2 (`orders`/`order_items` money fields), §11.3 (confirm transaction
calls this), ADR-006 (money as integer minor units — this algorithm operates on `bigint` minor
units throughout, never floats).

## Authority split

- **Computation order + rounding:** technical convention (blueprint forbids inventing ad-hoc money
  math — this locks one deterministic algorithm).
- **Tax rate + inclusive/exclusive:** business defaults accepted by Human Owner 2026-07-22 in
  `HO_DEFAULTS_v1.md` (10% inclusive). If those change later, only STEP 3 and catalog price
  semantics change; steps 1–2 and 4–6 stay.

## Algorithm

```text
INPUT: order_items[] { variant_id, quantity, unit_price_minor (from catalog snapshot at quote time) }
       discount_rules[] (may be empty)
       tax_rate_bps = 1000  # 10% — HO_DEFAULTS_v1.md; do not invent another rate

STEP 1 — Line subtotal (per item, before any discount)
  line_subtotal_minor = unit_price_minor * quantity
  # Integer multiplication only — quantity is numeric(18,6) per §7.1, but money stays integer minor
  # units; if quantity has a fractional part (e.g. weight-based sale), round the multiplication
  # result to the nearest minor unit using ROUND_HALF_UP (never floor/truncate — that silently
  # under-charges every fractional-quantity line).

STEP 2 — Discount (applied per line, BEFORE tax)
  line_discount_minor = apply_discount_rules(line_subtotal_minor, discount_rules)
  # Order of operations: discount reduces the taxable base. This is the standard convention (most
  # jurisdictions tax the post-discount price, not the pre-discount price) and matches how
  # `order.price.override` in the permission matrix is scoped (overriding price/discount, not tax).
  # If multiple discounts apply to one line (e.g. a line-level % off + an order-level coupon),
  # apply them in a fixed, deterministic order: line-level rules first (by rule priority field, low
  # to high), then order-level rules distributed pro-rata across lines by post-line-discount
  # subtotal — never apply order-level discount to the order total as a single undistributed
  # number, or per-line net amounts won't reconcile against `order_items.line_total` (§7.11.2
  # requires per-line snapshot).
  line_taxable_base_minor = line_subtotal_minor - line_discount_minor
  # Round line_discount_minor with ROUND_HALF_UP if a percentage discount produces a fractional
  # minor unit (e.g. 10% of 999 = 99.9 → 100).

STEP 3 — Tax (per line) — TAX-INCLUSIVE (HO_DEFAULTS_v1)
  # Catalog unit_price_minor and post-discount line_taxable_base_minor are GROSS (VAT included).
  # Back out VAT; line_total_minor remains the gross amount charged to the customer.
  line_total_minor = line_taxable_base_minor
  line_tax_minor = ROUND_HALF_UP(line_total_minor * tax_rate_bps / (10000 + tax_rate_bps))
  line_net_minor = line_total_minor - line_tax_minor
  # tax_rate_bps = 1000 → tax = gross * 1000/11000 (standard inclusive extraction).

STEP 4 — Order-level aggregation
  subtotal_minor      = SUM(line_subtotal_minor across items)
  discount_minor       = SUM(line_discount_minor across items)
  tax_minor            = SUM(line_tax_minor across items)
  # Sum the already-rounded per-line values — do NOT recompute tax on the summed subtotal (that
  # produces a different, and wrong, total due to rounding — this is the single most common order-
  # calculation bug in real systems: "line-level rounding" and "total-level rounding" disagree by a
  # few minor units on any order with more than one line).

STEP 5 — Shipping and fees (added after tax, per blueprint §7.11.1's field order: subtotal,
          discount, tax, shipping, fee, grand_total)
  grand_total_minor = subtotal_minor - discount_minor + tax_minor + shipping_minor + fee_minor
  # Shipping/fee taxability (whether shipping itself is taxed) is bundled into the same open
  # Human Owner question as step 3 — until that's answered, treat shipping_minor as already
  # tax-inclusive-or-exempt (no separate shipping tax line) as the simplest default.

STEP 6 — Snapshot immutably at confirm (per §7.11.2: "Price/cost snapshot immutable sau confirm")
  Persist subtotal_minor/discount_minor/tax_minor/shipping_minor/fee_minor/grand_total_minor and
  every line's line_subtotal_minor/line_discount_minor/line_tax_minor/line_total_minor onto
  order_items/orders at confirm time (§11.3's "snapshot order items, price, cost, tax, discount").
  A later catalog price change MUST NOT alter these values (§4.3 invariant 5).

OUTPUT: { subtotal_minor, discount_minor, tax_minor, shipping_minor, fee_minor, grand_total_minor,
          line_items[] { line_subtotal_minor, line_discount_minor, line_tax_minor, line_total_minor } }
```

## Rounding rule (applies everywhere above)

`ROUND_HALF_UP` at the **line level**, not the order level — see Step 4's note. Never use banker's
rounding (`ROUND_HALF_EVEN`) here: it's a defensible choice in some domains but adds a class of
"why doesn't 2×50% of an odd total equal the same as 1×the full amount" support tickets that
`ROUND_HALF_UP` avoids, and it's the convention most Vietnamese e-commerce platforms already use
(reduces surprise for the eventual buyer-facing team, even though this is a technical, not
business, justification — flag to Human Owner if this assumption should be revisited).

## Test cases required (per blueprint §20.2 Step 3's "state/precondition conflict" + money-invariant
testing convention)

- Single line, no discount, no tax (`tax_rate_bps = 0` — the only value currently valid until Human
  Owner sets a real rate).
- Multiple lines, per-line rounding produces a different total than would summing-then-rounding
  once (this is the regression test for Step 4's note — construct a case where it actually differs,
  e.g. 3 lines of 333 minor units each with a 10% discount).
- Percentage discount producing a fractional minor unit (verify `ROUND_HALF_UP`, not truncation).
- Order-level discount distributed pro-rata across lines that don't divide evenly — verify the sum
  of distributed amounts equals the original order-level discount exactly (no minor-unit leakage
  or duplication from rounding each line's share independently).
- `grand_total_minor` reconciles exactly against `SUM(line_total_minor) + shipping_minor +
  fee_minor` — this is the invariant every future refactor of this algorithm must preserve.
