# Human Owner Defaults v1

**Status:** Resolved — Human Owner accepted proposed defaults (2026-07-22)  
**Policy:** Choice C in enterprise doc-freeze design — these values are authoritative for contracts, tickets, design-specs, and implementation until a later ADR supersedes them.  
**Tracker:** `docs/collaboration/SIGNOFF_TRACKER.md`

## 1. VAT / tax (orders)

| Field | Value | Notes |
|-------|-------|-------|
| Standard VAT rate | **10%** | `tax_rate_bps = 1000` |
| Price storage | **Tax-inclusive** | Catalog `unit_price_minor` includes VAT; order calc backs out tax (see `docs/domain/order-calculation.md` STEP 3 inclusive branch) |
| Discount vs tax | Discount **before** tax extraction | Unchanged from technical default |
| Rounding | ROUND_HALF_UP on minor units | ADR-006 — integer minor units only |
| Multi-rate VAT | Out of v1 | Single rate 10% for all taxable lines; non-taxable flag may be added later via ADR |

## 2. Billing plans (v1 stub — 3 tiers)

Money amounts are **VND minor units** (đồng). Prices below are stubs for entitlement wiring, not a commercial quote.

| Plan id | Name | Monthly price (minor = đồng) | Seats | Orders / month | AI suggestions / day | Channels | Over-limit (see §3) |
|---------|------|-----------------------------:|------:|---------------:|---------------------:|---------:|---------------------|
| `plan_free` | Free | 0 | 2 | 50 | 20 | 1 | soft_warn then hard_block |
| `plan_pro` | Pro | 499000 (₫499,000) | 10 | 2_000 | 500 | 5 | soft_warn then hard_block |
| `plan_business` | Business | 1999000 (₫1,999,000) | 50 | 20_000 | 5_000 | 20 | soft_warn then hard_block |

### Entitlement flags (minimum)

| Flag / meter | Free | Pro | Business |
|--------------|------|-----|----------|
| `feature.web_admin` | yes | yes | yes |
| `feature.ai_copilot` | limited | yes | yes |
| `feature.desktop_client` | no | yes | yes |
| `feature.ops_support_access` | no | no | yes |
| `meter.orders_created` | 50 / mo | 2_000 / mo | 20_000 / mo |
| `meter.ai_suggestions` | 20 / day | 500 / day | 5_000 / day |
| `meter.channel_accounts` | 1 | 5 | 20 |

Billing period: **calendar month UTC**, reset at `00:00:00` on the 1st.  
Trial: none in v1 (upgrade is immediate entitlement change).

## 3. Over-limit behavior

When a meter would exceed the plan limit:

1. **soft_warn (default first breach band):** allow the action; emit `billing.usage_recorded` + in-app banner / SSE notice; HTTP 200 with warning header `X-Entitlement-Warning: meter=<id>`.
2. **hard_block (at or above 100% of quota):** reject with Problem Details `ENTITLEMENT_LIMIT_EXCEEDED` (add to error catalog in W3 if missing); no partial write.
3. **No auto-upgrade** in v1 — UI may deep-link to `/billing`.

Critical meters using hard_block at 100%: `meter.orders_created`, `meter.channel_accounts`.  
Softer meters may soft_warn until 110% then hard_block: `meter.ai_suggestions`.

## 4. Implications for freeze waves

- **W1/W3:** OpenAPI billing + order money fields must reflect inclusive tax and entitlement errors.
- **W5:** `BE-BIL-*`, `BE-ORD-002` tickets cite this file — not invent rates.
- **W6:** Billing / order screens copy may say “Giá đã gồm VAT 10%”.

## 5. Change control

Supersede only via ADR + new `HO_DEFAULTS_vN.md` + SIGNOFF update. Do not silently edit rates in tickets.
