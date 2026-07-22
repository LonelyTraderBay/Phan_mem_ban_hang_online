---
doc_type: frontend_implementation_specification
project: AI Sales Operating System / AI Sales Manager
language: vi-VN
version: 2.0.0
status: implementation_baseline
supersedes: 02_FRONTEND_WORKPLAN_AI_Sales_OS(1).md version 1.0
created_date: 2026-06-26
owner_team: Frontend AI Agent (Web Admin / Desktop / Super Admin scope)
required_approvers:
  - Frontend AI Agent
  - Backend AI Agent
  - Design AI Agent
  - Human Owner
security_classification: Internal
purpose: >
  Đặc tả triển khai Frontend cấp production/enterprise cho Web Admin,
  Windows Client và Super Admin Portal. Tài liệu là nguồn chuẩn để Frontend AI
  Agent triển khai, kiểm thử, tích hợp và phát hành nhất quán.
---

# FRONTEND PRODUCTION IMPLEMENTATION SPECIFICATION
## AI SALES OPERATING SYSTEM — ENTERPRISE-GRADE BASELINE

> **Trạng thái phê duyệt:** Tài liệu này là baseline triển khai. Một feature chỉ được code vào nhánh release khi đạt đầy đủ Definition of Ready tại mục 22. Các dữ liệu nghiệp vụ, enum, permission và API chưa có contract chính thức tuyệt đối không được tự suy đoán.

---

# Mục lục

1. [Mục tiêu, phạm vi và cách sử dụng](#1-mục-tiêu-phạm-vi-và-cách-sử-dụng)
2. [Ngôn ngữ quy chuẩn và nguyên tắc không thương lượng](#2-ngôn-ngữ-quy-chuẩn-và-nguyên-tắc-không-thương-lượng)
3. [Quyết định kiến trúc đã khóa](#3-quyết-định-kiến-trúc-đã-khóa)
4. [Cấu trúc monorepo và quy tắc phụ thuộc](#4-cấu-trúc-monorepo-và-quy-tắc-phụ-thuộc)
5. [Môi trường, cấu hình và quản lý phiên bản](#5-môi-trường-cấu-hình-và-quản-lý-phiên-bản)
6. [Quy trình phát triển cho người và AI coding agent](#6-quy-trình-phát-triển-cho-người-và-ai-coding-agent)
7. [Design system, UX, accessibility và i18n](#7-design-system-ux-accessibility-và-i18n)
8. [Route map và layout architecture](#8-route-map-và-layout-architecture)
9. [Authentication, session, tenant và device](#9-authentication-session-tenant-và-device)
10. [Authorization, permission, PII và support access](#10-authorization-permission-pii-và-support-access)
11. [REST API contract và generated client](#11-rest-api-contract-và-generated-client)
12. [Realtime contract và đồng bộ cache](#12-realtime-contract-và-đồng-bộ-cache)
13. [State management, cache, concurrency và offline](#13-state-management-cache-concurrency-và-offline)
14. [Error UX, retry, resilience và rate limit](#14-error-ux-retry-resilience-và-rate-limit)
15. [Security baseline](#15-security-baseline)
16. [Observability, audit và telemetry](#16-observability-audit-và-telemetry)
17. [Performance budget và SLO](#17-performance-budget-và-slo)
18. [Testing strategy và quality gates](#18-testing-strategy-và-quality-gates)
19. [CI/CD, release, rollback và supply-chain](#19-cicd-release-rollback-và-supply-chain)
20. [Windows Client architecture](#20-windows-client-architecture)
21. [Đặc tả triển khai theo module](#21-đặc-tả-triển-khai-theo-module)
22. [Definition of Ready và Definition of Done](#22-definition-of-ready-và-definition-of-done)
23. [Lộ trình triển khai và backlog có thứ tự](#23-lộ-trình-triển-khai-và-backlog-có-thứ-tự)
24. [RACI và cơ chế phối hợp](#24-raci-và-cơ-chế-phối-hợp)
25. [Risk register và phương án kiểm soát](#25-risk-register-và-phương-án-kiểm-soát)
26. [Mẫu ticket, PR và prompt cho AI](#26-mẫu-ticket-pr-và-prompt-cho-ai)
27. [Checklist production release](#27-checklist-production-release)
28. [Phụ lục contract mẫu](#28-phụ-lục-contract-mẫu)
29. [Danh sách artefact bắt buộc](#29-danh-sách-artefact-bắt-buộc)
30. [Tiêu chuẩn tham chiếu](#30-tiêu-chuẩn-tham-chiếu)

---

# 1. Mục tiêu, phạm vi và cách sử dụng

## 1.1 Mục tiêu

Tài liệu này chuyển workplan cấp cao thành **implementation specification có thể thực thi**. Sau khi các contract bắt buộc được Backend AI Agent xác nhận và (khi có rủi ro nghiệp vụ/bảo mật thật sự) Human Owner phê duyệt, Frontend AI Agent phải có thể:

- Tạo monorepo và pipeline chuẩn.
- Xây dựng Web Admin, Windows Client và Super Admin Portal.
- Tạo design system và shared packages không phụ thuộc vòng.
- Tích hợp API/realtime theo contract được version hóa.
- Xử lý auth, permission, PII, multi-tenant, concurrency và offline an toàn.
- Viết unit/component/contract/E2E/security/accessibility test.
- Deploy staging, canary, production và rollback có kiểm soát.
- Vận hành qua telemetry, error tracking, SLO và runbook.

## 1.2 Phạm vi sản phẩm Frontend

```text
Web Admin
├── Onboarding
├── Dashboard / Reports
├── Smart Inbox
├── AI Copilot
├── Orders / Payments / Shipping
├── Product / SKU / Import
├── Inventory
├── Knowledge / Policy
├── Channel Connect / Health
├── Users / Roles / Devices
├── Audit Logs
└── Billing / Usage

Windows Client
├── Secure login/session
├── Smart Inbox
├── AI Copilot
├── Order from chat
├── Product search
├── Native notification
├── Print preview / native print
├── Encrypted local draft/cache
├── Crash recovery
└── Signed auto-update

Super Admin Portal — deployment riêng
├── Tenant health
├── Channel/AI/system health
├── Feature flags
├── Support elevation
├── Emergency disable controls
├── Alerts
└── Audit
```

## 1.3 Ngoài phạm vi Frontend

Frontend không phải nguồn sự thật cho:

- Tenant isolation.
- Authorization/security decision cuối cùng.
- Inventory reservation transaction.
- Order pricing, discount, tax, shipping fee calculation.
- AI tool execution và guardrail.
- Channel webhook/token lifecycle.
- Revenue/profit calculation.
- Payment confirmation.
- Audit log bất biến.
- Backup/restore.

Frontend chỉ biểu diễn kết quả Backend đã xác nhận và không được giả lập trạng thái thành công cho các nghiệp vụ trên.

## 1.4 Cách đội ngũ sử dụng tài liệu

Frontend AI Agent (và Backend AI Agent khi cần đối chiếu chéo) phải đọc theo thứ tự:

1. Mục 2–6 để hiểu quy tắc nền tảng.
2. Mục 9–19 cho mọi task có API, auth, dữ liệu hoặc release.
3. Module tương ứng tại mục 21.
4. Definition of Ready/Done tại mục 22.
5. Ticket template tại mục 26.

Một ticket chỉ được bắt đầu khi `DoR = PASS`. Nếu thiếu contract, người thực hiện phải tạo một **Contract Gap** thay vì tự tạo field/status/permission.

## 1.5 Trạng thái sẵn sàng

| Mức | Ý nghĩa | Hành động được phép |
|---|---|---|
| `READY-FOUNDATION` | Kiến trúc và repo đã khóa | Làm platform, shell, design system, test infra |
| `READY-MOCK` | UX + schema draft đã duyệt | Làm UI bằng mock sinh từ contract |
| `READY-INTEGRATION` | API/realtime staging ổn định | Tích hợp staging, contract test |
| `READY-PILOT` | Security, E2E, observability đạt gate | Pilot có feature flag |
| `READY-PRODUCTION` | Release checklist đạt 100% | Canary rồi production |
| `BLOCKED-CONTRACT` | Thiếu dữ liệu bắt buộc | Không code business behavior |

---

# 2. Ngôn ngữ quy chuẩn và nguyên tắc không thương lượng

## 2.1 Từ khóa quy chuẩn

- **MUST / PHẢI:** bắt buộc để merge/release.
- **MUST NOT / KHÔNG ĐƯỢC:** vi phạm sẽ block merge/release.
- **SHOULD / NÊN:** mặc định phải làm; bỏ qua cần ADR hoặc waiver.
- **MAY / CÓ THỂ:** tùy chọn có kiểm soát.

## 2.2 Nguyên tắc không thương lượng

1. Không lưu access token/refresh token của Web trong `localStorage`, `sessionStorage` hoặc IndexedDB.
2. Không lưu raw token của Facebook/Zalo/TikTok hay nền tảng tích hợp ở bất kỳ client nào.
3. Không dùng `tenant_id` do UI nhập để quyết định quyền truy cập.
4. Không hiển thị “đã gửi”, “đã giữ hàng”, “đã thanh toán”, “đã hủy” trước khi server xác nhận.
5. Không optimistic-update cho money, inventory, message send, order confirm/cancel, payment hoặc shipping.
6. Không tạo TypeScript model nghiệp vụ thủ công trùng với OpenAPI-generated model.
7. Không sửa file generated bằng tay.
8. Không render HTML từ customer/channel/AI nếu chưa sanitize bằng adapter đã duyệt.
9. Không đưa PII, token, prompt nhạy cảm hoặc attachment URL vào log/telemetry.
10. Không merge feature thiếu loading, empty, error, forbidden, conflict và offline behavior phù hợp.
11. Không merge write action thiếu idempotency/concurrency rule.
12. Không dùng PermissionGate như cơ chế bảo mật; Backend phải lọc dữ liệu và enforce permission.
13. Không để Super Admin chung origin, session hoặc deployment với tenant app.
14. Không dùng Windows 10 làm nền hỗ trợ mặc định. Chỉ hỗ trợ khi khách hàng có ESU/LTSC và waiver được phê duyệt.
15. Không phát hành desktop binary chưa ký số và chưa xác minh updater signature.
16. Không để AI coding agent tự “đoán” business rule. Mọi giả định phải được ghi rõ và duyệt.

---

# 3. Quyết định kiến trúc đã khóa

## 3.1 Architecture Decision Record bắt buộc

Các quyết định dưới đây là baseline. Thay đổi phải qua ADR mới do Frontend AI Agent đề xuất; nếu thay đổi kéo theo đánh đổi kiến trúc/rủi ro thật sự (bảo mật, vận hành, chi phí khó đảo ngược), Human Owner phải phê duyệt trước khi merge. Thay đổi thuần kỹ thuật, tuân thủ ADR hiện có thì không cần thêm bước phê duyệt người riêng.

| ADR | Quyết định | Lý do chính |
|---|---|---|
| ADR-FE-001 | Monorepo `pnpm workspace + Turborepo` | Một lockfile, shared package, affected build, cache CI |
| ADR-FE-002 | React + TypeScript strict + Vite cho Web Admin/Super Admin | SPA nội bộ không cần SSR/SEO, dễ chia sẻ với Tauri |
| ADR-FE-003 | Tauri 2 cho Windows Client | Footprint nhỏ, capability model, native integration có kiểm soát |
| ADR-FE-004 | Super Admin là app/deployment/origin riêng | Giảm blast radius, tách audience/session/telemetry |
| ADR-FE-005 | REST command/query + SSE event stream | Command rõ qua HTTP; SSE đủ cho one-way realtime và hỗ trợ resume |
| ADR-FE-006 | OpenAPI 3.1.1 là REST source of truth | Tooling ổn định; nâng 3.2 qua ADR sau khi toolchain được chứng nhận |
| ADR-FE-007 | AsyncAPI 3.1 là event source of truth | Payload/version/replay có contract máy đọc được |
| ADR-FE-008 | TanStack Query quản lý server state | Cache, invalidation, cancellation, retry và hydration rõ ràng |
| ADR-FE-009 | Zustand chỉ cho client state nhỏ | Tránh duplicate server state và global store phình to |
| ADR-FE-010 | React Hook Form + Zod cho form/view validation | Tách UI validation khỏi server contract, type-safe |
| ADR-FE-011 | Radix primitives + design tokens + CSS variables | Accessibility primitives, theme và consistency |
| ADR-FE-012 | TanStack Table + Virtual cho bảng/list lớn | Headless, virtualize, kiểm soát rendering |
| ADR-FE-013 | Web dùng BFF/same-origin HttpOnly session cookie | Token không lộ cho JavaScript, giảm rủi ro XSS token theft |
| ADR-FE-014 | Desktop dùng Authorization Code + PKCE qua system browser | Tuân thủ native-app OAuth security practice |
| ADR-FE-015 | Server tạo PDF packing slip phiên bản bất biến | Kết quả in nhất quán, audit được, không lệch font/layout client |
| ADR-FE-016 | Không có generic offline write queue ở MVP | Tránh gửi trùng, giá/tồn cũ và hành vi không xác định |
| ADR-FE-017 | Feature flags typed, bootstrap từ server, default off | Kill switch và rollout có kiểm soát |
| ADR-FE-018 | Error contract theo RFC 9457 có extensions | Chuẩn hóa lỗi máy đọc được và support trace |

## 3.2 Stack chuẩn

| Lớp | Công nghệ baseline | Chính sách |
|---|---|---|
| Runtime CI | Node.js 24 LTS | Pin patch bằng toolchain file; cập nhật security patch tự động |
| Language | TypeScript 6.x, `strict: true` | Không `any` không kiểm soát; `noUncheckedIndexedAccess` |
| UI | React 19.x | Chỉ stable, không canary |
| Build | Vite 8.x | Pin minor trong release train |
| Package manager | pnpm stable | `--frozen-lockfile` trong CI |
| Monorepo task runner | Turborepo | Remote cache không chứa secret |
| Routing | React Router stable | Route manifest typed trong từng app |
| Server state | TanStack Query | Query key factory bắt buộc |
| Client state | Zustand | Chỉ session view, connection state, UI preferences |
| Forms | React Hook Form + Zod | Server vẫn validate lại |
| UI primitives | Radix UI hoặc package headless đã duyệt | Không fork trực tiếp nếu chưa cần |
| Styling | CSS variables + CSS Modules; utility classes giới hạn | Token là nguồn sự thật, không hard-code màu |
| Table/list | TanStack Table + TanStack Virtual | Virtualize theo ngưỡng dữ liệu |
| Mock | MSW | Handler sinh/đối chiếu contract |
| Unit/component | Vitest + Testing Library | Test behavior, không test implementation detail |
| E2E | Playwright | Chromium/Edge PR smoke; đa trình duyệt nightly |
| Component catalog | Storybook | Visual + a11y regression |
| Error tracking | Sentry qua telemetry adapter | Redact PII trước khi gửi |
| Tracing | OpenTelemetry-compatible adapter | `traceparent`/request correlation |
| Desktop | Tauri 2 + Rust commands | Capability least privilege |

> Không nâng major version trực tiếp trong feature PR. Dependency major upgrade phải có ticket riêng, migration note, benchmark và rollback plan.

## 3.3 Sơ đồ triển khai

```text
                           ┌───────────────────────────┐
                           │ Identity Provider / OIDC  │
                           └─────────────┬─────────────┘
                                         │
       ┌──────────────────────┐          │          ┌──────────────────────┐
       │ Web Admin Origin     │          │          │ Super Admin Origin   │
       │ app.example.com      │          │          │ ops.example.com      │
       │ Vite static assets   │          │          │ Vite static assets   │
       └──────────┬───────────┘          │          └──────────┬───────────┘
                  │ same-origin cookie   │                     │ separate session
                  ▼                      │                     ▼
       ┌──────────────────────┐          │          ┌──────────────────────┐
       │ Tenant BFF/Gateway   │◄─────────┘          │ Ops BFF/Gateway      │
       └──────────┬───────────┘                     └──────────┬───────────┘
                  │ REST + SSE                                   │ REST + SSE
                  └──────────────────────┬───────────────────────┘
                                         ▼
                           ┌───────────────────────────┐
                           │ Cloud API / Event Service │
                           └───────────────────────────┘

       ┌─────────────────────────────────────────────────────────┐
       │ Windows Client — Tauri                                  │
       │ system-browser OIDC + PKCE → secure OS storage          │
       │ REST + SSE → Cloud API/Gateway                          │
       └─────────────────────────────────────────────────────────┘
```

## 3.4 Nguyên tắc layering

```text
UI route/page
  ↓
Feature component
  ↓
Feature hook / use-case adapter
  ↓
Domain mapper + query/mutation factory
  ↓
Generated API client / realtime client
  ↓
HTTP/SSE transport
```

Quy tắc:

- UI không gọi `fetch` trực tiếp.
- UI không import file generated trực tiếp, ngoại trừ type-only trong adapter được duyệt.
- Generated DTO phải được map sang view model khi dữ liệu cần format, permission hoặc state composition.
- Domain package không import React, browser API, Tauri hoặc app package.
- Platform-specific code chỉ đi qua `packages/platform`.
- Feature A không import internal của Feature B; chỉ dùng public API hoặc domain package.

---

# 4. Cấu trúc monorepo và quy tắc phụ thuộc

## 4.1 Cấu trúc chuẩn

```text
ai-sales-os-frontend/
├── apps/
│   ├── web-admin/
│   │   ├── src/app/
│   │   ├── src/routes/
│   │   ├── src/features/
│   │   └── src/main.tsx
│   ├── super-admin/
│   │   ├── src/app/
│   │   ├── src/routes/
│   │   ├── src/features/
│   │   └── src/main.tsx
│   └── windows-client/
│       ├── src/
│       └── src-tauri/
│
├── packages/
│   ├── api-generated/          # codegen only, không sửa tay
│   ├── api-client/             # transport, auth, interceptors, mappers
│   ├── auth/                   # session bootstrap, guards, cross-tab logout
│   ├── config/                 # typed runtime config
│   ├── design-tokens/          # colors, spacing, typography, motion
│   ├── domain/                 # entity/value object/state transition helpers
│   ├── feature-flags/          # registry + typed evaluation
│   ├── forms/                  # field primitives, common validators only
│   ├── i18n/                   # locale, messages, time/currency format
│   ├── permissions/            # permission registry + UI policy helpers
│   ├── platform/               # browser/desktop adapter interfaces
│   ├── printing/               # preview/download/native-print adapter
│   ├── realtime/               # SSE, replay, dedupe, subscription router
│   ├── state/                  # query key factories, persistence policies
│   ├── telemetry/              # logs, traces, errors, redaction
│   ├── test-utils/             # fixtures, MSW, render helpers
│   └── ui/                     # shared design-system components
│
├── contracts/
│   ├── openapi/
│   │   ├── tenant-api.yaml
│   │   └── ops-api.yaml
│   ├── asyncapi/
│   │   ├── tenant-events.yaml
│   │   └── ops-events.yaml
│   ├── permissions/
│   │   └── permission-matrix.yaml
│   ├── errors/
│   │   └── error-catalog.yaml
│   └── fixtures/
│
├── docs/
│   ├── adr/
│   ├── runbooks/
│   ├── threat-model/
│   ├── ux/
│   └── release/
│
├── tooling/
│   ├── eslint-config/
│   ├── tsconfig/
│   ├── scripts/
│   └── generators/
│
├── .changeset/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── pnpm-lock.yaml
```

## 4.2 Cấu trúc một feature

```text
src/features/conversations/
├── api/
│   ├── conversation.mapper.ts
│   ├── conversation.queries.ts
│   └── conversation.mutations.ts
├── components/
├── domain/
├── hooks/
├── routes/
├── schemas/
├── state/
├── tests/
├── index.ts
└── README.md
```

`README.md` của feature phải ghi:

- Mục tiêu.
- Route.
- Permission.
- Feature flags.
- API/event dependency.
- Query keys.
- State machine.
- PII fields.
- Test commands.
- Owner.

## 4.3 Import boundary

| Từ | Được import | Không được import |
|---|---|---|
| `apps/*` | mọi package public API | internal file của app khác |
| `packages/ui` | tokens, i18n type | api-client, auth, app feature |
| `packages/domain` | không hoặc package thuần | React, browser, Tauri |
| `packages/api-client` | generated, config, telemetry | UI, feature component |
| `packages/realtime` | config, auth adapter, telemetry | app UI |
| feature | shared packages + public feature API | deep import feature khác |

Boundary phải được enforce bằng ESLint rule và CI.

## 4.4 Coding standard

- `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` bật.
- Không dùng non-null assertion `!` trừ adapter đã chứng minh invariant và có comment.
- Không dùng enum TypeScript runtime; dùng `as const`/generated union.
- Không dùng default export cho shared library.
- Một file component chính không vượt quá 300 dòng nếu chưa có lý do rõ.
- Hook không làm nhiều hơn một responsibility.
- Không gọi mutation trong render/effect mà thiếu guard idempotent.
- Mọi timer/subscription phải cleanup.
- Mọi list item có stable key từ server/client id; không dùng array index cho mutable list.
- Date/time lưu ISO UTC; format ở boundary hiển thị.
- Money dùng integer minor unit hoặc decimal string từ API; không dùng floating-point JS để tính nghiệp vụ.

---

# 5. Môi trường, cấu hình và quản lý phiên bản

## 5.1 Môi trường

| Environment | Mục đích | Dữ liệu | Release policy |
|---|---|---|---|
| `local` | Dev cá nhân | fake/MSW | không truy cập prod |
| `dev` | Tích hợp liên tục | synthetic | auto deploy từ main |
| `staging` | UAT/E2E/perf | anonymized/synthetic | release candidate |
| `pilot` | Tenant pilot | dữ liệu thật giới hạn | feature flag + canary |
| `production` | Khách hàng thật | production | approval + rollback |

Không dùng production data ở local/dev. Snapshot phục vụ debug phải được ẩn danh và có TTL.

## 5.2 Runtime config

Mỗi web app tải `runtime-config.json` cùng origin trước bootstrap. File chỉ chứa cấu hình công khai:

```json
{
  "environment": "staging",
  "apiBaseUrl": "/api",
  "sseUrl": "/events",
  "oidcClientId": "web-admin",
  "releaseVersion": "2.4.0",
  "buildSha": "abc1234",
  "telemetryEnabled": true,
  "supportUrl": "/help"
}
```

Không được chứa:

- Client secret.
- Access/refresh token.
- Encryption key.
- Channel token.
- Database credential.
- Private signing key.

Runtime config phải được validate bằng schema trước khi render app. Sai config → `FatalConfigurationScreen`, không tiếp tục chạy mơ hồ.

## 5.3 Versioning

- App release dùng Semantic Versioning.
- Contract có version độc lập và backward-compatibility policy.
- Desktop updater so sánh semantic version và release channel.
- Mỗi error report gửi `releaseVersion`, `buildSha`, `environment`.
- Mỗi request gửi `X-Client-Version`; Backend có thể trả `426 CLIENT_UPGRADE_REQUIRED`.

## 5.4 Browser/OS support matrix

Web production baseline:

- Microsoft Edge: 2 major stable gần nhất.
- Google Chrome: 2 major stable gần nhất.
- Firefox: 2 major stable gần nhất.
- Safari: 2 major stable gần nhất nếu Human Owner xác nhận macOS là thị trường hỗ trợ.
- Không hỗ trợ Internet Explorer.

Windows Client baseline:

- Windows 11 Enterprise/Pro còn trong lifecycle support.
- Windows 10 chỉ khi thiết bị thuộc ESU/LTSC hợp lệ và có exception bằng văn bản.
- WebView2 Evergreen runtime bắt buộc.
- Kiến trúc x64 là bắt buộc; arm64 là roadmap riêng.

---

# 6. Quy trình phát triển cho người và AI coding agent

## 6.1 Branch và commit

- `main` luôn releasable.
- Feature branch: `feat/FE-123-conversation-filter`.
- Fix: `fix/FE-456-order-conflict`.
- Không có long-lived develop branch.
- Commit theo Conventional Commits.
- Squash merge mặc định; giữ commit riêng cho migration quan trọng khi cần.

## 6.2 Quy trình một ticket

1. Kiểm tra DoR.
2. Đọc module spec, OpenAPI, AsyncAPI, permission matrix và design-spec (Design AI Agent).
3. Viết plan ngắn trong ticket/PR.
4. Nếu thiếu contract: đặt `BLOCKED-CONTRACT`, tạo câu hỏi có ví dụ request/response mong muốn.
5. Tạo test/fixture trước hoặc đồng thời với implementation.
6. Implement theo layer; không gọi transport từ component.
7. Chạy lint, typecheck, unit, component và test liên quan.
8. Kiểm tra keyboard, focus, screen reader label, loading/error/offline.
9. Tạo Storybook cho component phức tạp.
10. Cập nhật changelog/feature README/telemetry event nếu có.
11. Tạo PR theo template.
12. Frontend AI Agent tự kiểm tra security/contract/UX/test qua subagent review (`fe-architecture-reviewer`, `pii-telemetry-auditor`, `a11y-gap-reviewer`) và bộ test acceptance của chính nó; đánh đổi rủi ro/nghiệp vụ thật sự thì escalate Human Owner.
13. Merge sau khi mọi quality gate xanh.

## 6.3 Quy tắc AI coding agent

AI agent PHẢI:

- Chỉ sửa file trong phạm vi ticket.
- Liệt kê assumption trước khi code.
- Không tạo endpoint/status/permission chưa có trong contract.
- Không sửa generated code.
- Không giảm test để làm pipeline xanh.
- Không disable lint/type/security rule nếu chưa có waiver.
- Không đưa secret hoặc dữ liệu thật vào fixture.
- Tạo code nhỏ, có thể review; không refactor toàn repo ngoài phạm vi.
- Trả về danh sách file thay đổi, test đã chạy, rủi ro còn lại và contract gap.

AI agent phải dừng phần business implementation và xuất `BLOCKED-CONTRACT` khi một trong các điều sau xảy ra:

- Không có request/response schema.
- Enum hoặc state transition không rõ.
- Không biết permission hoặc field masking.
- Write action không có idempotency/concurrency rule.
- UX không có behavior cho conflict/offline/error.
- API mock và OpenAPI mâu thuẫn.

## 6.4 Code review bắt buộc

Review kỹ thuật (deterministic: kiến trúc, PII/telemetry, a11y) do Frontend AI Agent tự thực hiện qua subagent review của chính nó (`fe-architecture-reviewer`, `pii-telemetry-auditor`, `a11y-gap-reviewer`); không có reviewer người riêng cho các mục này. Human Owner chỉ tham gia khi có đánh đổi rủi ro/nghiệp vụ thật sự (ví dụ signing key, production release).

| Loại thay đổi | Reviewer tối thiểu |
|---|---|
| Shared UI/token | Frontend AI Agent (`fe-architecture-reviewer`) + Design AI Agent (đối chiếu token/UX) |
| Auth/session/permission | Frontend AI Agent (`fe-architecture-reviewer`, `pii-telemetry-auditor`) |
| API/realtime client | Frontend AI Agent + Backend AI Agent (chủ hợp đồng API/event) |
| Money/order/inventory | Frontend AI Agent (bao gồm test/QA tự viết) + Backend AI Agent |
| Super Admin | Frontend AI Agent (`pii-telemetry-auditor`) + Backend AI Agent (đối chiếu audit/elevation) |
| Tauri/Rust/native | Frontend AI Agent (desktop/native review) |
| Build/release/signing | Frontend AI Agent (thực thi CI/CD) + Human Owner (quyết định signing key/production release) |

## 6.5 Waiver

Bất kỳ ngoại lệ nào phải có:

- ID.
- Lý do.
- Owner.
- Phạm vi.
- Rủi ro.
- Mitigation.
- Ngày hết hạn.
- Người phê duyệt (Human Owner — waiver là chấp nhận rủi ro, không phải quy tắc deterministic nên không tự động hóa).

Waiver không có ngày hết hạn là không hợp lệ.


# 7. Design system, UX, accessibility và i18n

## 7.1 Design token

Token là nguồn sự thật duy nhất cho:

- Color semantic: background, surface, text, border, action, focus, success, warning, danger, info.
- Typography: family, size, line-height, weight, letter-spacing.
- Spacing: scale 4px hoặc hệ đã duyệt.
- Radius, shadow, z-index.
- Motion duration/easing.
- Breakpoint.
- Density: comfortable/compact cho table/inbox.

Không hard-code mã màu trong feature. Status color phải luôn đi cùng text/icon, không dùng màu làm tín hiệu duy nhất.

## 7.2 Component contract

Mỗi component shared phải có:

- Public props nhỏ và ổn định.
- Keyboard behavior.
- Focus behavior.
- ARIA label/role khi cần.
- Disabled, read-only, loading, error state.
- Dark/high-contrast compatibility nếu roadmap yêu cầu.
- Storybook stories: default, edge, error, long text, keyboard.
- Unit/component test.
- Usage guideline và anti-pattern.

Component tối thiểu:

```text
Foundation
Button, IconButton, Link, Text, Heading, VisuallyHidden
Input, Textarea, Select, Combobox, Checkbox, Radio, Switch
FormField, FieldError, DatePicker, MoneyInput, QuantityInput
Badge, StatusBadge, Avatar, Card, Divider, Tooltip
Modal, Drawer, Popover, DropdownMenu, Tabs, Accordion
Toast, Banner, AlertDialog, ConfirmDialog
Skeleton, EmptyState, ErrorPanel, ForbiddenState, OfflineState
Table, VirtualizedList, FilterBar, Pagination, CursorLoadMore
FileUploader, AttachmentPreview, PdfPreview
PermissionGate, FeatureFlagGate, PiiField
```

## 7.3 Responsive policy

Ứng dụng ưu tiên desktop. Baseline viewport:

| Nhóm | Kích thước | Behavior |
|---|---:|---|
| Minimum supported web | 1280×720 | Không mất action chính; panel có thể collapse |
| Standard | 1440×900 | Layout đầy đủ |
| Large | 1920×1080+ | Giới hạn content width hợp lý; table mở rộng |
| Windows compact | 1024×720 | Inbox dùng drawer/collapse panel |

Không coi mobile browser là target chính ở MVP. Nếu route cần mobile, phải có ticket và acceptance riêng.

## 7.4 Accessibility baseline

Mục tiêu conformance: **WCAG 2.2 Level AA**.

Bắt buộc:

- Toàn bộ action dùng được bằng keyboard.
- Focus visible và không bị modal/header che.
- Modal trap focus, trả focus về trigger khi đóng.
- Không có keyboard trap.
- Label và error message được liên kết với input.
- Dynamic update quan trọng có `aria-live` phù hợp, không spam screen reader.
- Target size, contrast và zoom 200% đạt tiêu chí.
- Không dùng placeholder thay label.
- Table có header semantic; virtualized list vẫn có accessible name/count.
- Drag/drop phải có phương án keyboard.
- Timeout/session warning cho phép gia hạn nếu policy cho phép.
- Animation tôn trọng `prefers-reduced-motion`.

Accessibility gate:

- Automated axe scan cho Storybook và route chính.
- Manual keyboard test cho mọi flow P0/P1.
- Screen reader smoke test cho login, inbox, order confirm và support access.

## 7.5 Content design

- Copy lỗi nói rõ: chuyện gì xảy ra, dữ liệu có được lưu không, người dùng cần làm gì.
- Không hiển thị raw error từ server cho người dùng nếu chứa kỹ thuật/PII.
- Tên trạng thái nghiệp vụ lấy từ translation catalog, không hard-code rải rác.
- Confirm action nguy hiểm phải nêu đối tượng và hậu quả.
- Toast không phải nơi duy nhất báo lỗi quan trọng; lỗi form/action phải nằm gần context.

Ví dụ:

```text
Không tốt: “Error 409”.
Tốt: “Đơn hàng đã được Minh cập nhật lúc 14:32. Tải phiên bản mới trước khi xác nhận.”
```

## 7.6 Internationalization

Baseline locale: `vi-VN`; kiến trúc phải sẵn sàng thêm locale.

Quy tắc:

- Không nối chuỗi để tạo câu.
- Dùng ICU message cho plural/gender nếu cần.
- Ngày giờ lưu UTC, hiển thị theo timezone tenant/user.
- Money format theo currency từ server; không mặc định VND nếu contract không xác nhận.
- Số điện thoại/address không tự format làm thay đổi dữ liệu nguồn.
- CSV/Excel import phải chỉ rõ locale decimal/date format.
- Translation key theo domain: `orders.confirm.success`, không dùng nội dung tiếng Việt làm key.

## 7.7 Design-spec handoff gate

Không có Figma/designer con người; Design AI Agent thay thế bằng design-spec dạng markdown (wireframe mô tả bằng lời, screen state, copy, component/token mapping) lưu tại `frontend/docs/ux/design-specs/<route-or-screen-name>.md`. Mỗi screen trước `READY-MOCK` phải có:

- Link/đường dẫn tới design-spec markdown của Design AI Agent (thay cho link Figma/version).
- Desktop standard + minimum viewport.
- Happy, empty, loading, error, forbidden, conflict state.
- Component/token mapping.
- Copy do Design AI Agent soạn; Human Owner phê duyệt trước khi coi là final, trừ khi Human Owner ủy quyền khác đi.
- Interaction note.
- Field validation và required/optional.
- Responsive/collapse behavior.

---

# 8. Route map và layout architecture

## 8.1 Web Admin routes

### Public/Auth

| Route | Access | Ghi chú |
|---|---|---|
| `/login` | anonymous | Redirect nếu đã đăng nhập |
| `/auth/callback` | anonymous callback | Không log code/state |
| `/forgot-password` | anonymous | Rate-limit UX |
| `/reset-password` | tokenized | Token không lưu/log |
| `/2fa` | partial session | Có resend/cooldown |
| `/accept-invite` | tokenized | Validate tenant/invite status |

### Tenant app

| Route | Permission/condition |
|---|---|
| `/onboarding` | onboarding incomplete hoặc owner/admin |
| `/dashboard` | `authenticated` |
| `/inbox` | `conversation.read` |
| `/inbox/:conversationId` | `conversation.read` + record access |
| `/orders` | `order.read` |
| `/orders/:orderId` | `order.read` + record access |
| `/products` | `catalog.read` |
| `/products/import` | `catalog.write` |
| `/products/:productId` | `catalog.read` |
| `/inventory` | `inventory.read` |
| `/inventory/movements` | `inventory.read_movements` |
| `/knowledge` | `knowledge.read` |
| `/channels` | `channel.read` |
| `/channels/:channelId/health` | `channel.health.read` |
| `/ai/settings` | `ai.configure` |
| `/ai/logs` | `ai.log.read` |
| `/ai/blocked` | `ai.blocked.read` |
| `/reports` | `report.read` |
| `/settings/tenant` | `tenant.update` hoặc `tenant.read` variant |
| `/settings/users` | `member.read` |
| `/settings/roles` | `role.read` |
| `/settings/devices` | `authenticated` |
| `/settings/audit-logs` | `audit.read` |
| `/settings/notifications` | authenticated |
| `/billing` | `billing.read` |

`/dashboard` chỉ yêu cầu `authenticated` vì đây là shell tổng hợp dữ liệu từ nhiều domain — gate cả
trang sau một permission mới (`dashboard.read`) sẽ tệ hơn về RBAC so với gate từng widget theo đúng
permission thật của nó (ví dụ widget doanh thu check `report.read`, widget lợi nhuận check
`report.profit.read`) qua `PermissionGate` như mô tả ở §10.2. `/settings/devices` chỉ cần
`authenticated` vì đây là self-service — user quản lý device/session của chính mình, không có
permission `device.*` nào trong permission catalog. Nếu sau này cần màn hình cho admin xem device
của thành viên khác (khác với self-service), đó là permission chưa tồn tại ở backend — phải báo
Contract Gap (`frontend/docs/collaboration/OUTBOX.md`), không tự suy đoán tên permission.

### Super Admin — app riêng

| Route | Permission/condition |
|---|---|
| `/tenants` | `ops.tenant.read` |
| `/tenants/:tenantId` | `ops.tenant.read` |
| `/tenants/:tenantId/health` | `ops.tenant_health` |
| `/feature-flags` | `ops.feature_flag` |
| `/alerts` | `ops.alert.read` |
| `/support-access` | `support.access` + MFA/step-up |
| `/ai-health` | `ops.ai_health.read` |
| `/channel-health` | `ops.channel_health.read` |
| `/audit-logs` | `ops.audit.read` |

## 8.2 Layout hierarchy

```text
RootErrorBoundary
└── RuntimeConfigProvider
    └── TelemetryProvider
        └── AuthProvider
            └── FeatureFlagProvider
                └── PermissionProvider
                    └── QueryClientProvider
                        └── RealtimeProvider
                            └── RouterProvider
                                └── AppShell
```

Auth bootstrap phải hoàn tất trước khi subscribe realtime. Query cache phải clear trước khi chuyển session/tenant.

## 8.3 Route guard behavior

- Chưa auth → redirect login, giữ safe return URL cùng origin.
- Auth nhưng thiếu permission → render 403, không gọi data API nếu biết trước.
- API trả 403 dù UI nghĩ có quyền → invalidate `/me`, log permission mismatch, render forbidden.
- Feature flag off → 404 hoặc “Chưa được bật” theo policy đã được Human Owner xác nhận; không render partial feature.
- Record not found/không được phép xem → dùng server status; không suy luận tồn tại record.
- Route chunk load fail sau deploy → reload một lần có guard; sau đó render recovery screen.

## 8.4 Navigation

Sidebar/menu được sinh từ typed route manifest:

```ts
interface AppRouteMeta {
  id: string;
  path: string;
  labelKey: string;
  requiredPermissions?: readonly string[];
  featureFlag?: string;
  breadcrumb?: boolean;
  telemetryName: string;
}
```

Không copy điều kiện permission ở nhiều nơi. Route manifest là nguồn điều hướng, Backend vẫn là nguồn bảo mật.

---

# 9. Authentication, session, tenant và device

## 9.1 Web authentication

Baseline:

- OIDC Authorization Code flow.
- Web Admin giao tiếp qua BFF/same-origin gateway.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax` hoặc chặt hơn theo flow.
- JavaScript không thấy access/refresh token.
- State-changing request có CSRF protection được Backend/BFF định nghĩa.
- Login redirect chỉ cho allowlist same-origin.
- Logout thu hồi server session và clear client cache.

Không tự viết password authentication nếu đã có IdP. Nếu sản phẩm có login nội bộ, Backend/Auth team phải cung cấp contract và threat model riêng.

## 9.2 Desktop authentication

- Dùng system browser, không dùng embedded WebView để nhập credential.
- Authorization Code + PKCE.
- Redirect qua loopback `127.0.0.1` hoặc private-use URI đã đăng ký.
- Validate `state`, issuer, audience, nonce nếu OIDC.
- Refresh token chỉ lưu trong OS credential vault hoặc encrypted stronghold do Rust layer quản lý.
- Frontend WebView chỉ nhận session abstraction, không nhận refresh token raw.
- Device registration diễn ra sau login thành công.

## 9.3 Session bootstrap contract

`GET /me` hoặc `/session/bootstrap` phải trả tối thiểu:

```json
{
  "user": {
    "id": "usr_123",
    "display_name": "Nguyễn An",
    "locale": "vi-VN",
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "tenant": {
    "id": "ten_123",
    "name": "Shop ABC",
    "currency": "VND",
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "session": {
    "id": "ses_123",
    "version": 7,
    "expires_at": "2026-06-26T10:00:00Z",
    "reauth_required_at": null
  },
  "device": {
    "id": "dev_123",
    "trusted": true
  },
  "permissions": ["conversation.read", "conversation.reply"],
  "feature_flags": {
    "ai_copilot": { "enabled": true, "variant": "v1" }
  }
}
```

Không trả permission dưới dạng role name duy nhất. UI evaluate permission cụ thể.

## 9.4 Auth state machine

```text
unknown
  → bootstrapping
  → anonymous
  → authenticating
  → partially_authenticated (2FA/step-up)
  → authenticated
  → refreshing
  → expired
  → revoked
  → signing_out
  → anonymous
```

Mỗi transition phải có UI và test. Không tạo vòng refresh vô hạn.

## 9.5 Refresh/retry rule

- Chỉ một refresh request chạy tại một thời điểm.
- Các request 401 hợp lệ chờ cùng refresh promise.
- Retry request tối đa một lần sau refresh.
- Refresh fail/revoked → clear cache + draft policy + logout.
- Không refresh cho 403.
- Không redirect login lặp vô hạn.

Với cookie/BFF, refresh có thể ở server. Client vẫn cần xử lý `SESSION_EXPIRED` thống nhất.

## 9.6 Cross-tab/session sync

Web dùng `BroadcastChannel` hoặc cơ chế tương đương cho:

- Logout.
- Session revoked.
- Tenant switched.
- Permission/feature flag refresh.

Không broadcast PII/token.

## 9.7 Device management

Device record tối thiểu:

- device id/name/type.
- OS/browser/app version.
- created_at/last_seen_at.
- trusted/revoked state.
- current device marker.
- approximate location nếu policy cho phép.

Revoke flow:

1. User xác nhận device và hậu quả.
2. Gửi idempotent revoke mutation.
3. Server trả trạng thái revoked.
4. Session trên device bị revoke nhận event `device.revoked` hoặc fail ở heartbeat.
5. Client xóa credential/cache theo policy và logout.
6. Audit event được tạo server-side.

## 9.8 Tenant switching

Nếu user thuộc nhiều tenant:

- Không chỉ thay `tenant_id` trong request.
- Gọi endpoint switch tenant để tạo session context mới.
- Dừng SSE cũ.
- Cancel in-flight request.
- Clear query cache, client store, local draft namespace và telemetry context.
- Bootstrap lại `/me`.
- Mở SSE mới.

---

# 10. Authorization, permission, PII và support access

## 10.1 Permission model

Permission dùng format:

```text
<domain>.<resource_or_scope>.<action>
```

Ví dụ:

```text
conversation.read
conversation.reply
conversation.assign
conversation.note.create
customer.pii.read
customer.export
catalog.read
catalog.write
inventory.read
inventory.adjust
order.read
order.create
order.confirm
order.cancel
report.read
report.profit.read
ai.suggestion.generate
ai.suggestion.send
ai.configure
billing.read
billing.write
```

Permission registry phải typed và sinh từ contract. Không viết string tùy ý trong component.

## 10.2 Ba tầng kiểm soát UI

1. **Route gate:** có được vào trang không.
2. **Action gate:** có được thao tác không.
3. **Field gate:** có được xem field nhạy cảm không.

`PermissionGate` hỗ trợ policy:

```ts
type DeniedBehavior = 'hide' | 'disable' | 'replace-with-mask' | 'show-request-access';
```

Frontend AI Agent phải chỉ định behavior cho từng action theo design-spec của Design AI Agent; nếu ảnh hưởng chính sách bảo mật/nghiệp vụ nhạy cảm thì Human Owner xác nhận. Không mặc định hide mọi thứ vì người dùng cần hiểu tại sao không thể thao tác.

## 10.3 Field-level PII

Phân loại:

| Class | Ví dụ | Client rule |
|---|---|---|
| Public | product name công khai | Có thể cache bình thường |
| Internal | tenant configuration | Cache theo session/tenant |
| Confidential | conversation, draft order | TTL ngắn, mã hóa desktop |
| Restricted | phone, address, token, payment identifier | Chỉ fetch khi có quyền; không log/cache tùy tiện |

Server phải bỏ field restricted khi user thiếu quyền. Frontend masking chỉ bổ sung UX.

`PiiField` phải hỗ trợ:

- masked value.
- reveal nếu permission + policy cho phép.
- reveal timeout.
- copy permission riêng nếu cần.
- audit event server-side cho reveal/export nếu quy định.

## 10.4 Permission mismatch

Nếu `/me` nói có quyền nhưng endpoint trả 403:

- Không retry.
- Invalidate session bootstrap.
- Hiển thị forbidden message.
- Ghi telemetry `permission_contract_mismatch` không chứa dữ liệu record.
- Nếu xảy ra lặp lại, tạo alert cho team.

## 10.5 Support access của Super Admin

Support elevation phải có:

- MFA/step-up authentication.
- Chọn tenant.
- Chọn scope/quyền tối thiểu.
- Nhập reason bắt buộc.
- Ticket/reference id nếu policy yêu cầu.
- Thời hạn ngắn, ví dụ 15–60 phút theo policy.
- Banner rõ “Đang truy cập hỗ trợ tenant X”.
- Watermark/telemetry context.
- Không cho export mặc định.
- Mọi action có audit với actor gốc và elevated identity.
- Emergency revoke/expire.

Không impersonate âm thầm. Không dùng session tenant thông thường cho support access.

## 10.6 Permission matrix artefact

`contracts/permissions/permission-matrix.yaml` phải có:

```yaml
permissions:
  - key: order.cancel
    routes: [/orders/:orderId]
    ui_actions: [order.cancel.button]
    backend_endpoints: [POST /orders/{order_id}/cancel]
    denied_behavior: hide
    pii_fields: []
    roles_default: [owner, manager]
    audit_required: true
```

CI kiểm tra mọi permission dùng trong code tồn tại trong registry.

---

# 11. REST API contract và generated client

## 11.1 Source of truth

- OpenAPI 3.1.1 là nguồn sự thật cho REST.
- Contract nằm cùng repository hoặc được pin theo immutable version.
- Generated client được tái tạo trong CI.
- CI fail nếu codegen tạo diff chưa commit.
- Fixture phải validate against schema.
- Không có “shared-types” viết tay giữa Backend và Frontend.

## 11.2 Quy tắc endpoint

Mỗi operation phải có:

- `operationId` ổn định.
- Summary/description.
- Auth scope/permission extension.
- Request headers/path/query/body schema.
- Required/optional/nullability rõ.
- Enum description.
- Success response và mọi error response.
- Pagination/filter/sort.
- Idempotency rule.
- Concurrency rule.
- Rate-limit behavior.
- Example tối thiểu happy + common failure.
- PII classification extension nếu có.

## 11.3 Error format — RFC 9457 extensions

Content type: `application/problem+json`.

```json
{
  "type": "https://errors.example.com/order/version-conflict",
  "title": "Order version conflict",
  "status": 409,
  "detail": "Đơn hàng đã được người khác cập nhật.",
  "instance": "/orders/ord_123",
  "code": "ORDER_VERSION_CONFLICT",
  "request_id": "req_abc123",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "retryable": false,
  "field_errors": [],
  "meta": {
    "current_version": 8,
    "submitted_version": 7
  }
}
```

Frontend map theo `code`, không map bằng `detail` text.

## 11.4 Field validation error

```json
{
  "type": "https://errors.example.com/validation-error",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_ERROR",
  "request_id": "req_123",
  "field_errors": [
    {
      "path": "customer.phone",
      "code": "INVALID_PHONE",
      "message": "Số điện thoại không hợp lệ."
    }
  ]
}
```

Frontend ưu tiên map `path` vào form. Field không map được → hiển thị form-level error.

## 11.5 Pagination/filter/sort

Cursor pagination cho conversation/order/message lớn:

```json
{
  "data": [],
  "page_info": {
    "next_cursor": "opaque_cursor",
    "has_more": true
  },
  "meta": {
    "request_id": "req_123"
  }
}
```

Quy tắc:

- Cursor opaque, client không parse.
- Sort phải deterministic và có tie-breaker ID.
- Filter keys được định nghĩa trong OpenAPI.
- Không gửi filter không biết; không serialize `undefined` thành string.
- Search có debounce 250–400ms, cancel request cũ.
- URL lưu filter chia sẻ được khi không chứa PII.

## 11.6 Request headers

| Header | Khi dùng |
|---|---|
| `X-Request-ID` | Client có thể tạo UUID; server trả/canonicalize |
| `Idempotency-Key` | POST/action không idempotent theo contract |
| `If-Match` | Update entity có ETag/version |
| `X-Client-Version` | Mọi request |
| `X-Device-ID` | Desktop/device-aware endpoint |
| `Accept-Language` | Message locale nếu Backend hỗ trợ |
| `traceparent` | Distributed tracing |
| CSRF header | Web cookie session theo BFF contract |

Không thêm `tenant_id` header từ user input.

## 11.7 Idempotency

Các action tối thiểu phải hỗ trợ idempotency:

- Send customer message.
- Create order.
- Confirm/cancel order.
- Create payment intent/record.
- Create shipment.
- Inventory adjustment/reservation/release.
- Import commit.
- AI suggestion send.

Client tạo UUID khi user bắt đầu một logical action và giữ nguyên key cho retry cùng action. Tạo key mới khi user thay đổi payload hoặc chủ động tạo action mới.

## 11.8 Concurrency

Entity mutable quan trọng phải có `version` hoặc `ETag`:

- Conversation assignment/status.
- Product/variant.
- Knowledge source.
- Inventory adjustment request nếu editable.
- Order.
- Feature flag.
- Tenant settings.

Update gửi `If-Match` hoặc version. Server trả 409/412. Client không tự merge money/inventory/order; hiển thị conflict UI.

## 11.9 API client architecture

```text
api-generated/
  generated transport/types
       ↓
api-client/
  auth/session handling
  request metadata
  problem parser
  telemetry
  retry policy
       ↓
feature/api/
  query keys
  DTO → view-model mapper
  mutation idempotency/concurrency
       ↓
component
```

## 11.10 Retry policy

| Request | Auto retry |
|---|---|
| GET network/502/503/504 | Có, tối đa 2–3 lần với jitter nếu screen còn active |
| GET 429 | Theo `Retry-After`; không spam |
| POST/PATCH/DELETE không có idempotency | Không |
| Write có idempotency + retryable server flag | Có tối đa theo contract |
| 400/401/403/404/409/412/422 | Không, trừ refresh cho 401 |

## 11.11 File upload/download

Upload phải có:

- Allowed MIME/extensions từ server config.
- Max size.
- Progress/cancel.
- Virus-scan state: uploading → processing → safe/rejected.
- Signed upload URL TTL nếu dùng object storage.
- Không preview file trước khi safe nếu policy yêu cầu.
- Filename sanitize khi hiển thị.

Download/export:

- Permission riêng.
- Signed URL TTL ngắn.
- Không log URL.
- Export lớn dùng async job + notification.

---

# 12. Realtime contract và đồng bộ cache

## 12.1 Transport baseline

- Server-Sent Events (SSE) cho server → client.
- REST cho mọi command.
- Một connection cho tenant session/app.
- Web dùng same-origin cookie.
- Desktop dùng access token abstraction ở native layer/gateway.
- Heartbeat mỗi khoảng theo server contract.
- Event schema mô tả bằng AsyncAPI 3.1.

WebSocket chỉ được thêm qua ADR nếu cần typing presence, bidirectional low-latency hoặc yêu cầu không đáp ứng bằng SSE.

## 12.2 Event envelope

```json
{
  "id": "evt_01J...",
  "type": "conversation.message_received",
  "schema_version": 1,
  "subject": "conversation/con_123",
  "aggregate_id": "con_123",
  "aggregate_version": 42,
  "sequence": 10293,
  "occurred_at": "2026-06-26T08:30:00.123Z",
  "correlation_id": "req_abc",
  "causation_id": "cmd_xyz",
  "actor": {
    "type": "customer",
    "id": "cus_123"
  },
  "payload": {}
}
```

Quy tắc:

- `id` duy nhất toàn stream.
- `schema_version` tăng khi payload breaking.
- `sequence` hỗ trợ phát hiện gap theo stream.
- `aggregate_version` chống event cũ ghi đè state mới.
- Event có thể duplicate; client phải idempotent.
- Event có thể đến trễ; client so version/occurred_at theo rule.

## 12.3 Event catalog tối thiểu

```text
session.permission_changed
session.feature_flags_changed
device.revoked

conversation.created
conversation.updated
conversation.assigned
conversation.sla_breached
conversation.message_received
conversation.message_status_changed
conversation.note_created

ai.suggestion_requested
ai.suggestion_ready
ai.approval_required
ai.response_blocked
ai.suggestion_expired

order.created
order.updated
order.confirmed
order.cancelled
order.reservation_changed
order.reservation_expired
order.payment_changed
order.shipment_changed

inventory.updated
inventory.low_stock

channel.health_changed
channel.authorization_expired

import.job_updated
export.job_updated
system.notification
```

## 12.4 Reconnect/resume

1. Lưu `lastEventId` theo session/tenant, không chứa PII.
2. Reconnect exponential backoff + full jitter, có upper bound.
3. Gửi `Last-Event-ID`.
4. Server replay trong cửa sổ retention.
5. Nếu replay không thể, server trả signal `resync_required`.
6. Client invalidate query scopes liên quan hoặc toàn tenant cache.
7. Draft local không bị reset.
8. UI hiển thị trạng thái `connecting/reconnecting/offline/resyncing/connected`.

Không hiển thị toast cho mỗi reconnect ngắn. Chỉ banner khi mất kết nối vượt ngưỡng hoặc dữ liệu có thể stale.

## 12.5 Event processing pipeline

```text
raw SSE event
→ JSON parse
→ envelope schema validation
→ session/tenant context check
→ dedupe by event id
→ version/gap check
→ event router
→ query cache update/invalidate
→ domain side-effect
→ telemetry
```

Event parse fail:

- Không crash app.
- Log schema/version + event id, không log payload nhạy cảm.
- Increment metric.
- Nếu liên tục vượt threshold, close stream và resync.

## 12.6 Cache merge rules

- Message mới: append theo message ID, sort server timestamp + stable ID.
- Message status: update nếu version mới hơn.
- Conversation list: update summary nhưng không overwrite draft/composer local.
- Order/inventory: ưu tiên invalidate/refetch thay vì tự tính lại nếu payload không đầy đủ.
- Permission/session event: refetch `/me`, không tự patch permission tùy ý.
- Feature flag kill switch: evaluate ngay, cancel action/route theo safe behavior.

## 12.7 Draft preservation

Composer state key:

```text
<sessionId>:<tenantId>:<conversationId>:reply-draft
```

Khi realtime cập nhật conversation:

- Không remount composer nếu conversation ID không đổi.
- Không replace textarea value.
- Có thể hiển thị “Có tin nhắn mới” nhưng giữ cursor/selection.
- Khi user chuyển conversation, draft được persist theo policy.

## 12.8 Event contract test

- AsyncAPI validate trong CI.
- Fixture từng event version.
- Consumer test bảo đảm handler chấp nhận contract hiện tại và phiên bản backward-compatible.
- Unknown event type được ignore + metric, không crash.
- Unsupported breaking schema version → resync/upgrade-required policy.

---

# 13. State management, cache, concurrency và offline

## 13.1 Phân loại state

| State | Nơi quản lý |
|---|---|
| Server entity/list | TanStack Query |
| URL filters/sort/pagination | Router search params |
| Form state | React Hook Form |
| Local component state | React state/reducer |
| Session view/connection state | Zustand nhỏ hoặc provider |
| Draft cần tồn tại qua reload | approved persistence adapter |
| Native capability state | platform adapter |

Không copy server data vào Zustand để “dễ dùng”.

## 13.2 Query key convention

```ts
const conversationKeys = {
  all: (tenantScope: string) => ['tenant', tenantScope, 'conversations'] as const,
  list: (tenantScope: string, filters: ConversationFilters) =>
    [...conversationKeys.all(tenantScope), 'list', canonicalize(filters)] as const,
  detail: (tenantScope: string, id: string) =>
    [...conversationKeys.all(tenantScope), 'detail', id] as const,
};
```

- Tenant/session scope luôn có trong key.
- Filter được canonicalize để tránh cache duplicate.
- Không dùng object mutable.
- Mutation success invalidate đúng scope, không invalidate toàn bộ nếu không cần.

## 13.3 Cache lifetime

Mỗi query factory phải khai báo:

- `staleTime`.
- `gcTime`.
- Refetch on focus/reconnect.
- Persistence allowed/denied.
- PII classification.

Ví dụ policy:

| Dữ liệu | staleTime | Persist |
|---|---:|---|
| Permissions/session | ngắn, refetch event | Không hoặc metadata tối thiểu |
| Product catalog | 1–5 phút | Có giới hạn desktop |
| Inventory available | 0–30 giây | Chỉ read cache, luôn revalidate trước write |
| Conversation detail | 0–15 giây + realtime | Draft tách riêng; message cache TTL ngắn |
| Dashboard | 30–60 giây | Không cần offline |
| Audit log | 0 | Không persist |

Giá trị cuối cùng do Frontend AI Agent chốt dựa trên đo performance thật; nếu ảnh hưởng trải nghiệm/nghiệp vụ đáng kể thì Human Owner xác nhận.

## 13.4 Concurrency UX

Conflict state cung cấp:

- Ai/nguồn đã cập nhật nếu server cho phép.
- Thời điểm.
- Field/version thay đổi nếu an toàn.
- `Tải phiên bản mới`.
- `Sao chép nội dung của tôi` cho text draft.
- Merge thủ công chỉ cho field không nhạy cảm và có rule rõ.

Không có nút “Ghi đè” cho order/inventory/permission trừ khi Backend có quyền riêng và audit.

## 13.5 Offline policy chung

Default:

- Read cache có thể hiển thị với badge `Dữ liệu có thể cũ`.
- Draft text/order chưa submit có thể lưu local theo classification.
- Không tự gửi write khi online lại.
- Mọi write phải revalidate session, permission, price, inventory và entity version.

### Allowed offline

- UI preferences.
- Draft reply.
- Draft internal note nếu policy cho phép.
- Draft order chưa confirm.
- Recent product/conversation read cache có TTL.

### Disallowed offline

- Confirm order.
- Reserve inventory.
- Record payment.
- Create shipment.
- Send AI/customer message tự động.
- Change role/permission.
- Support elevation.
- Feature flag mutation.

## 13.6 Local persistence security

Web:

- Ưu tiên không persist PII.
- Draft có TTL và delete on logout/session revoke.
- Namespace theo session/tenant/user.
- Không lưu token.
- IndexedDB schema có version/migration/cleanup.

Desktop:

- Confidential draft/cache phải mã hóa at rest.
- Encryption key ở native secure storage, không nằm trong JS bundle.
- Local DB/file có TTL/quota.
- Logout/revoke xóa key và cache theo policy.
- Crash dump không chứa draft/PII.

## 13.7 Optional outbox — chỉ sau khi có contract

Một feature chỉ được dùng outbox khi có:

- Client operation ID.
- Idempotency key.
- Server duplicate detection.
- Payload expiry.
- Revalidation rule.
- User-visible pending/cancel/retry state.
- Ordering rule.
- Conflict rule.
- Test mất mạng/crash/restart.

Nếu thiếu một mục, chỉ lưu draft, không queue send.

---

# 14. Error UX, retry, resilience và rate limit

## 14.1 Error taxonomy

| Nhóm | Ví dụ | UX |
|---|---|---|
| Validation | 422 | Field/form error |
| Authentication | 401 | Refresh hoặc login |
| Authorization | 403 | Forbidden; không retry |
| Not found | 404 | Not-found hoặc record unavailable |
| Conflict | 409/412 | Conflict panel, refetch |
| Rate limit | 429 | Countdown/retry-after |
| Business blocked | 422/409 code cụ thể | Lý do + action sửa |
| Server transient | 502/503/504 | Retry có giới hạn |
| Network/offline | fetch fail | Offline/stale/draft behavior |
| Client defect | render/runtime | Error boundary + report |

## 14.2 Global error renderer

Mọi error hiển thị:

- Human message.
- Safe next action.
- Retry nếu thực sự retryable.
- Request ID/copy support ID.
- Không lộ stack, SQL, token, raw payload.

## 14.3 Action pending

- Disable duplicate submit trong khi mutation active.
- Loading label cụ thể: “Đang xác nhận đơn…”.
- Không khóa toàn màn hình nếu chỉ một panel đang gửi.
- Nếu request lâu, cho biết vẫn đang xử lý; không tự kết luận thất bại nếu server có async job.
- Với async job, poll/SSE theo job ID và cho phép rời màn hình.

## 14.4 Circuit-breaker UX

Nếu một dependency liên tục lỗi:

- Dừng auto retry vượt threshold.
- Hiển thị degraded banner.
- Giữ read-only functionality nếu an toàn.
- Có manual retry.
- Telemetry alert.

Ví dụ channel outbound lỗi không được làm inbox “im lặng”: message phải có failed status và retry/copy option.

## 14.5 Rate limit

Backend trả `Retry-After` và problem code. Frontend:

- Không auto retry sớm hơn.
- Disable action kèm countdown nếu phù hợp.
- Gộp thao tác search/filter; debounce.
- Không hiển thị technical quota nếu không cần.
- Với AI quota/billing, link đến usage/billing nếu user có quyền.

## 14.6 Error boundary hierarchy

```text
Root fatal boundary
├── Route boundary
├── Feature panel boundary
└── High-risk widget boundary (AI, print preview, attachment)
```

Một lỗi AI panel không được làm mất composer/order draft. Error boundary phải có reset key và report action.


# 15. Security baseline

## 15.1 Mức chuẩn

- Web/Tenant app: OWASP ASVS 5.0 Level 2 baseline.
- Super Admin/Auth/Desktop native bridge: áp dụng thêm các yêu cầu Level 3 phù hợp threat model.
- AI-facing UI: áp dụng các kiểm soát phù hợp từ OWASP AI/LLM verification guidance.
- Threat model bắt buộc trước pilot và cập nhật khi thêm channel/payment/support access.

## 15.2 Threat model tối thiểu

Phải phân tích:

- XSS từ customer message, AI output, product/knowledge content.
- CSRF với cookie session.
- Token/session theft.
- Clickjacking.
- Open redirect.
- Tenant cache leakage.
- Permission stale/mismatch.
- Malicious attachment/file import.
- Spreadsheet formula injection khi export/import.
- PII leakage qua logs, analytics, clipboard, notification.
- Realtime event spoof/replay/duplicate.
- Desktop native command abuse.
- Updater/package tampering.
- Support impersonation/elevation abuse.
- AI prompt injection hiển thị như trusted instruction.

## 15.3 XSS/content rendering

- Customer/AI/channel content mặc định render plain text.
- Linkify qua parser allowlist; thêm `rel="noopener noreferrer"` cho external link.
- HTML chỉ qua sanitizer configuration tập trung; không sanitize tùy ý từng feature.
- `dangerouslySetInnerHTML` bị ESLint cấm, chỉ allowlist trong component sanitizer.
- Markdown nếu hỗ trợ phải disable raw HTML và sanitize link/image scheme.
- AI tool/source content được gắn nhãn “Nguồn dữ liệu”, không được biến thành lệnh UI.

## 15.4 Content Security Policy và headers

Production ingress/BFF phải cấu hình:

- `Content-Security-Policy` với `default-src 'self'` và allowlist tối thiểu.
- Không `unsafe-eval` production.
- Tránh `unsafe-inline`; dùng nonce/hash nếu thật sự cần.
- `frame-ancestors 'none'` hoặc allowlist rõ.
- `object-src 'none'`.
- `base-uri 'self'`.
- HSTS.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy` chặt.
- `Permissions-Policy` tối thiểu.

CSP violation report phải redact URL/query chứa dữ liệu nhạy cảm.

## 15.5 CSRF

Với cookie auth:

- SameSite phù hợp.
- CSRF token hoặc origin verification cho state-changing request.
- Không dùng GET cho mutation.
- Kiểm tra Origin/Referer ở server.
- Frontend lấy token qua bootstrap/meta endpoint theo BFF contract, không persist lâu dài.

## 15.6 Secret management

- Không có secret trong repository, bundle, runtime-config hoặc Storybook.
- CI secret dùng secret manager và least privilege.
- Desktop signing key không xuất ra log/artifact.
- `.env.example` chỉ có tên biến giả.
- Secret scanning block PR.

## 15.7 Dependency/supply-chain security

- Lockfile bắt buộc.
- Chỉ dùng registry được duyệt.
- Package mới cần license/security/maintenance review.
- Không chạy install script không cần thiết; allowlist nếu package manager hỗ trợ.
- SCA scan mỗi PR và nightly.
- Critical/high vulnerability block release; exception phải có waiver hết hạn.
- Generate SBOM cho web artifact và desktop installer.
- Artifact checksum/signature lưu cùng release evidence.

## 15.8 Attachment/import security

- MIME sniff ở server, không tin extension.
- Virus/malware scan server-side.
- Client không mở executable/script.
- CSV export phải escape ô bắt đầu bằng `=`, `+`, `-`, `@` theo policy để giảm formula injection.
- Excel import preview không execute formula/macro.
- Image/PDF preview sandbox nếu khả thi.
- Signed URL không đưa vào telemetry.

## 15.9 Clipboard/notification

- Copy PII chỉ khi có permission và user action.
- Không auto-copy.
- Desktop notification mặc định không hiện phone/address/full message trên lock screen.
- Notification click chỉ điều hướng sau khi session hợp lệ.

## 15.10 Security test gate

Trước pilot:

- Threat model review.
- SAST/SCA/secret scan xanh.
- CSP report-only test rồi enforce.
- Auth/session/CSRF test.
- Tenant cache separation test.
- Permission/PII test.
- File upload abuse test.
- Desktop capability/updater/signing review.
- External penetration test cho production hoặc theo policy công ty.

---

# 16. Observability, audit và telemetry

## 16.1 Mục tiêu

Khi có lỗi production, team phải trả lời được:

- User/app version/environment nào gặp lỗi.
- Route/feature/action nào.
- Request/event ID nào.
- Lỗi client, network, contract hay server.
- Ảnh hưởng bao nhiêu session/tenant mà không lộ PII.
- Release nào bắt đầu regression.

## 16.2 Telemetry context

```ts
interface TelemetryContext {
  environment: string;
  releaseVersion: string;
  buildSha: string;
  app: 'web-admin' | 'windows-client' | 'super-admin';
  sessionIdHash?: string;
  tenantIdHash?: string;
  userIdHash?: string;
  deviceIdHash?: string;
  routeId?: string;
  featureFlags?: Record<string, string | boolean>;
}
```

ID phải hash/pseudonymize theo policy; không gửi display name, email, phone.

## 16.3 Error tracking

Capture:

- Unhandled exceptions/rejections.
- Error boundary events.
- API problem code/status/request_id.
- SSE reconnect/gap/schema error.
- Desktop native command failure.
- Print/update failure.

Không capture:

- Request/response body mặc định.
- Authorization/cookie.
- Customer message.
- Address/phone/email.
- AI prompt/tool payload.
- Signed URL.

## 16.4 Product/operational events

Event name phải theo registry, ví dụ:

```text
auth.login_completed
conversation.opened
conversation.reply_submitted
conversation.reply_failed
ai.suggestion_requested
ai.suggestion_edited
ai.suggestion_sent
order.draft_created
order.confirm_attempted
order.confirmed
print.preview_opened
print.completed
```

Mỗi event có:

- owner.
- business purpose.
- properties allowlist.
- PII classification.
- retention.
- expected volume.

Không tạo analytics event tự phát trong component.

## 16.5 Distributed tracing

- Client tạo/propagate trace context theo transport contract.
- API error hiển thị request ID; support có thể tìm trace server.
- SSE event có correlation/causation ID.
- Mutation telemetry liên kết idempotency key dạng hash, không gửi raw nếu policy cấm.

## 16.6 Frontend metrics/SLO signals

- Page/route load duration.
- Core Web Vitals.
- API latency/error rate theo operationId.
- SSE connected ratio/reconnect count/event lag.
- Mutation failure/conflict/rate-limit rate.
- JS error-free sessions.
- Desktop crash-free sessions.
- App startup/update/print success rate.
- Bundle size trend.

## 16.7 Audit

Frontend không tạo audit log nguồn sự thật. Frontend phải:

- Gửi reason/reference khi contract yêu cầu.
- Hiển thị server audit timeline.
- Không sửa/xóa audit record.
- Không giả định action thành công trước response.
- Liên kết request ID với action support khi phù hợp.

## 16.8 Alert thresholds

Threshold cụ thể do Frontend AI Agent thiết lập và vận hành; thay đổi ảnh hưởng ngân sách/hạ tầng thật thì Human Owner xác nhận. Tối thiểu có alert khi:

- JS error-free sessions giảm mạnh so baseline.
- Login failure tăng đột biến.
- SSE disconnect kéo dài.
- Message/order mutation failure tăng.
- Desktop updater/signature failure.
- Contract parse error xuất hiện sau deploy.
- Cross-tenant/permission anomaly dù chỉ một case.

---

# 17. Performance budget và SLO

## 17.1 User-centric target ban đầu

Các target dưới đây là release baseline và phải đo trên reference hardware/network được ghi trong performance plan:

| Chỉ số | Target p75 |
|---|---:|
| LCP route đầu tiên | ≤ 2.5 giây |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| Route transition với cache | ≤ 300 ms phản hồi cảm nhận |
| Initial shell JS gzip | ≤ 250 KB |
| Route critical JS tổng | ≤ 450 KB trước lazy chunks không thiết yếu |
| API feedback state | ≤ 100 ms sau click |
| Conversation list scroll | 55–60 FPS trên reference device |
| Desktop cold start | ≤ 3 giây p75 |
| Desktop crash-free sessions | ≥ 99.5% |

Nếu feature đặc thù vượt budget, PR phải kèm bundle/performance report và approval.

## 17.2 Data scale test

Tối thiểu test với:

- 100.000 products tổng tenant, page 50–100.
- 50.000 conversations, list virtualized.
- Thread 5.000 messages, windowed rendering hoặc incremental load.
- 10.000 orders.
- Import 50.000 dòng theo giới hạn Backend.
- Dashboard nhiều series/filter.

Không tải toàn bộ dataset lên browser để filter/sort.

## 17.3 Rendering rules

- Route-level code splitting.
- Lazy load chart/editor/PDF viewer.
- Virtualize list/table theo threshold.
- Stable selectors và memoization dựa trên profiling, không memo hóa mù.
- Debounce search; cancel stale request.
- Không parse/transform dataset lớn trong render.
- Worker cho CSV/Excel preview nặng nếu profiling chứng minh cần.
- Image/attachment thumbnail có kích thước rõ, lazy load.

## 17.4 Bundle governance

CI tạo bundle report và fail khi:

- Initial chunk vượt budget không có waiver.
- Duplicate dependency lớn.
- Import nguyên package khi có thể tree-shake.
- Source map production bị public ngoài policy.
- Desktop bundle chứa debug symbol/secret ngoài release process.

## 17.5 Performance test

- Lighthouse/Browser benchmark route chính trên staging.
- Playwright performance smoke cho login/dashboard/inbox/order.
- React profiler cho list/thread/panel.
- Load test API thuộc Backend; FE kiểm tra behavior dưới latency 200ms/1s/3s và packet loss.

---

# 18. Testing strategy và quality gates

## 18.1 Test pyramid

```text
                 E2E critical journeys
              Contract / integration tests
          Component / accessibility / visual tests
       Unit tests: domain, mapper, reducer, utility
```

Không dùng E2E để thay thế toàn bộ unit/component test.

## 18.2 Unit test

Ưu tiên:

- State transition helper.
- Money/date/format adapter.
- DTO → view model mapper.
- Permission/feature flag evaluation.
- Query key canonicalization.
- Idempotency key lifecycle.
- SSE dedupe/gap/version logic.
- Offline draft migration/TTL.
- Error mapping.

Coverage gate:

- Tổng repository: tối thiểu 75% lines, 65% branches.
- `auth`, `permissions`, `realtime`, `domain/order`, `domain/inventory`: tối thiểu 90% lines, 85% branches.
- Coverage không thay thế review chất lượng test.

## 18.3 Component test

Mỗi complex component test:

- Keyboard.
- Focus.
- Loading/empty/error/forbidden.
- Long text/locale.
- Permission variants.
- Async race.
- User behavior, không test internal state.

## 18.4 Contract test

- OpenAPI/AsyncAPI lint + validate.
- Generated client compiles.
- MSW fixture validate schema.
- Frontend consumer test chạy với staging provider contract.
- Breaking change detector block PR.
- Error catalog và permission registry coverage.

## 18.5 E2E critical journeys

P0 journeys:

1. Login → 2FA → bootstrap → logout.
2. Permission denied không lộ field/action.
3. Product create/edit + version conflict.
4. Import preview lỗi → sửa → commit → report.
5. Channel connect callback + health degraded.
6. Inbox receive realtime → reply → delivery failure/retry.
7. AI suggestion → edit → blocked/approval/send.
8. Order from chat → reservation → confirm → conflict/cancel.
9. Packing slip preview → print.
10. Device revoke → remote logout.
11. Support elevation → expire → audit.
12. Desktop offline → giữ draft → online → revalidate.

## 18.6 Browser matrix

PR:

- Chromium hoặc Edge smoke.
- Route/component a11y.

Nightly/release candidate:

- Chromium.
- Microsoft Edge branded.
- Firefox.
- WebKit/Safari equivalent nếu nằm trong support matrix.
- Windows desktop runner cho Tauri smoke.

## 18.7 Visual regression

Áp dụng cho:

- Shared components.
- App shell.
- Inbox layout.
- Order summary/confirm.
- Dashboard cards/table.
- Packing slip preview.
- Super Admin dangerous-action dialogs.

Snapshot thay đổi phải được đối chiếu với design-spec (Design AI Agent) trước khi Frontend AI Agent chấp nhận; không auto-approve hàng loạt.

## 18.8 Accessibility test

- Automated axe không có critical/serious violation.
- Keyboard checklist.
- Screen reader smoke.
- Zoom 200%.
- High contrast/forced colors nếu Windows target yêu cầu.

## 18.9 Resilience/chaos scenarios

MSW/E2E phải mô phỏng:

- 401 trong lúc nhiều request chạy.
- 403 permission stale.
- 409/412 conflict.
- 429 Retry-After.
- 5xx/timeout.
- SSE duplicate/out-of-order/gap/reconnect.
- Network offline giữa mutation.
- Tab refresh khi còn draft.
- Desktop crash/restart.
- App update fail/signature invalid.

## 18.10 Security test

- XSS payload ở customer/AI/product/knowledge.
- Open redirect.
- CSRF behavior.
- Cross-tenant cache/session reset.
- PII redaction in telemetry.
- Attachment filename/content-type abuse.
- CSV formula injection.
- Permission matrix negative tests.
- Native command allowlist/capability.

## 18.11 Test data

- Chỉ synthetic data.
- Fixture ID deterministic.
- Có Vietnamese diacritics, emoji, long text, RTL smoke nếu i18n roadmap.
- Có null/optional/unknown enum scenario.
- Không dùng phone/email thật.
- Fixture version đi cùng contract.

---

# 19. CI/CD, release, rollback và supply-chain

## 19.1 Pull request pipeline

Theo thứ tự:

1. Checkout và verify signed provenance nếu áp dụng.
2. Install Node/pnpm pinned.
3. `pnpm install --frozen-lockfile`.
4. Secret scan.
5. License/SCA scan.
6. OpenAPI/AsyncAPI/error/permission lint.
7. Codegen và kiểm tra working tree sạch.
8. ESLint/import boundary.
9. Typecheck toàn repo/affected graph.
10. Unit/component test + coverage.
11. Build apps/packages.
12. Build Storybook + a11y/visual test.
13. Bundle budget.
14. E2E smoke với MSW hoặc ephemeral env.
15. SAST.
16. Generate test/security evidence.

## 19.2 Main/staging pipeline

1. Build immutable web artifacts.
2. Generate SBOM/checksum.
3. Deploy dev/staging.
4. Run migration/compatibility check.
5. Run full contract/E2E/accessibility/performance smoke.
6. Publish source maps vào error tracker theo private policy.
7. Register release metadata.
8. Notify deployment status.

## 19.3 Desktop release pipeline

1. Build trên trusted Windows runner.
2. Compile Rust/Tauri release mode.
3. Run unit/integration/smoke.
4. Malware scan artifact.
5. Generate SBOM/checksum.
6. Sign executable/installer bằng approved certificate service.
7. Create signed updater manifest/package.
8. Verify signature bằng clean VM.
9. Publish beta ring.
10. Monitor crash/update metrics.
11. Promote stable ring khi gate đạt.

Private signing material không được xuất khỏi secret/HSM service.

## 19.4 Release strategy

Web:

- Feature flag + tenant cohort.
- Canary 1–5% hoặc internal tenants.
- Tăng dần 10% → 25% → 50% → 100% theo SLO.
- Kill switch không cần redeploy.

Desktop:

- Internal → beta → stable rings.
- Forced update chỉ cho security/compatibility và có grace period policy.
- Minimum supported version từ server config.

## 19.5 Rollback

Web rollback:

- Giữ ít nhất hai artifact trước.
- CDN/cache invalidation plan.
- Feature flag off trước nếu có thể.
- Contract phải backward-compatible đủ cửa sổ rollback.

Desktop rollback:

- Updater không mặc định downgrade tự động.
- Có previous signed installer và recovery runbook.
- Backend giữ compatibility với N phiên bản desktop được định nghĩa.
- Security incident có revoke/min-version mechanism.

## 19.6 Release gate

Không release khi:

- Có critical/high security finding chưa xử lý/waiver.
- Contract test fail.
- P0 E2E fail/flaky vượt threshold.
- Permission/PII negative test fail.
- Bundle/performance vượt budget không duyệt.
- Desktop unsigned/updater signature chưa verify.
- Không có Frontend AI Agent/Human Owner chịu trách nhiệm rollback.
- Observability dashboard/alert chưa hoạt động.

## 19.7 Change management

Mỗi release có:

- Release notes cho user/support.
- Breaking/behavior change note.
- Feature flags/cohort.
- Database/API dependency từ Backend.
- Known issues.
- Rollback steps.
- Frontend AI Agent chịu trách nhiệm rollback; Human Owner là on-call cho sự cố ảnh hưởng khách hàng/hạ tầng thật.
- Evidence link: test, security, artifact, SBOM.

---

# 20. Windows Client architecture

## 20.1 Scope production

Windows Client là thin client có native capability kiểm soát:

- Secure authentication/session.
- Smart Inbox/AI/Order/Product.
- Native notification.
- PDF preview/native print.
- Encrypted draft/read cache.
- Device registration/revoke.
- Crash recovery.
- Signed auto-update.

Không chạy webhook, business database, AI model/tool execution hoặc inventory transaction.

## 20.2 Platform adapter

```ts
interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clearNamespace(namespace: string): Promise<void>;
}

interface NotificationService {
  requestPermission(): Promise<'granted' | 'denied'>;
  show(input: SafeNotification): Promise<void>;
}

interface PrintService {
  listPrinters(): Promise<PrinterInfo[]>;
  preview(documentId: string): Promise<void>;
  print(documentId: string, printerId?: string): Promise<PrintResult>;
}

interface UpdateService {
  check(): Promise<UpdateInfo | null>;
  download(update: UpdateInfo): Promise<void>;
  install(update: UpdateInfo): Promise<void>;
}

interface DeviceService {
  getDeviceInfo(): Promise<DeviceInfo>;
  register(): Promise<RegisteredDevice>;
}
```

Web implementation không giả native capability. Feature dùng interface, không import Tauri plugin trực tiếp.

## 20.3 Tauri capability policy

- Mỗi window/webview có capability tối thiểu.
- Không bật shell/file-system rộng.
- File access chỉ app data/temp/approved print files.
- External URL chỉ mở allowlisted schemes/domains.
- Native command validate mọi input ở Rust.
- Không expose generic `execute(command)`.
- Plugin permission được review và pin version.

## 20.4 Local data

- Secure token/key ở native secure storage.
- Draft/cache mã hóa.
- App data namespace theo environment + user + tenant.
- TTL/quota/background cleanup.
- Logout/revoke xóa credential và cache theo policy.
- Upgrade migration có backup/rollback hoặc fail-safe read-only.
- Không log raw SQLite query/data nếu dùng local DB.

## 20.5 Notification

Notification payload tối thiểu:

```json
{
  "type": "hot_lead",
  "title": "Có khách hàng cần xử lý",
  "body": "Mở ứng dụng để xem chi tiết",
  "route": "/inbox/con_123"
}
```

Không đưa full message/phone/address mặc định. Khi click:

1. Kiểm tra app/session.
2. Refresh permission nếu cần.
3. Validate route/record access.
4. Điều hướng hoặc login.

## 20.6 Printing

Baseline:

1. User yêu cầu packing slip.
2. Server tạo immutable `print_document` với version/hash/audit.
3. Client tải PDF qua signed/authorized endpoint.
4. Preview trong sandbox/PDF viewer.
5. User chọn printer/settings.
6. Native layer print.
7. Client gửi print result telemetry; server audit reprint nếu contract yêu cầu.

Không tự tính lại order total/address ở template client.

## 20.7 Auto-update

- Update package/manifest ký số.
- Stable/beta channel tách.
- Verify signature trước install.
- Hiển thị release note, download progress, restart requirement.
- Không update khi đang có unsaved critical draft mà chưa cảnh báo.
- Recovery screen nếu update thất bại.
- Server có minimum supported version.

## 20.8 Crash recovery

- Error/crash screen không lộ stack cho user.
- Cho restart app.
- Draft đã persist an toàn được restore.
- Crash report redact PII.
- Safe mode có thể disable optional plugin/feature khi crash loop.

## 20.9 Windows acceptance

- Clean install/uninstall trên supported Windows.
- Login qua system browser.
- Secure storage verified.
- Device revoke remote logout.
- Notification click routing.
- Offline draft preserve.
- Print trên ít nhất printer/PDF driver matrix được duyệt.
- Signed update beta → stable.
- No PII/token trong logs/crash/artifacts.
- Capability penetration review pass.


# 21. Đặc tả triển khai theo module

Mỗi module dưới đây dùng cùng quy ước:

- **Entry criteria:** điều kiện trước khi bắt đầu.
- **Contract bắt buộc:** artefact Backend AI Agent/Human Owner/Design AI Agent phải cung cấp.
- **Implementation steps:** thứ tự code bắt buộc.
- **Critical states:** trạng thái phải render/test.
- **Exit criteria:** điều kiện hoàn tất module.

---

## F00 — Frontend Platform, Design System, App Shell và Developer Experience

### F00.1 Mục tiêu

Tạo nền tảng dùng chung để mọi feature phát triển độc lập nhưng nhất quán, có contract, test và release pipeline từ ngày đầu.

### F00.2 Entry criteria

- ADR-FE-001 đến ADR-FE-018 được duyệt.
- Repository/CI/registry access sẵn sàng.
- Brand token/UX baseline có owner (Design AI Agent soạn, Human Owner phê duyệt brand/copy).
- Backend AI Agent có ít nhất OpenAPI bootstrap draft.

### F00.3 Deliverables

```text
Monorepo chạy được
3 app skeleton tách build
Shared packages và boundary
Design tokens + Storybook
API codegen + transport
Auth/query/realtime provider skeleton
MSW + fixture validation
Lint/type/test/build/e2e pipeline
Telemetry adapter
Runtime config
Release metadata
```

### F00.4 Implementation steps

#### FE-F00-001 — Bootstrap toolchain

1. Pin Node LTS và pnpm.
2. Tạo `pnpm-workspace.yaml`, `turbo.json`, root scripts.
3. Bật package manager strict/lockfile policy.
4. Tạo shared tsconfig strict.
5. Tạo ESLint config, import boundary, no-dangerous-html rule.
6. Tạo formatter/editor settings.
7. Thêm CI install/type/lint placeholder.

**Acceptance:** clone sạch → một lệnh cài → `lint`, `typecheck`, `test`, `build` chạy xanh.

#### FE-F00-002 — App skeleton

1. Tạo `web-admin`, `super-admin`, `windows-client`.
2. Mỗi app có runtime config bootstrap, fatal error screen, release info.
3. Tạo route manifest và lazy route placeholder.
4. Tách Super Admin build/origin/session.
5. Windows app chỉ bật capability tối thiểu.

**Acceptance:** ba app build độc lập; không import source trực tiếp lẫn nhau.

#### FE-F00-003 — Design tokens và primitives

1. Chuẩn hóa semantic token.
2. Tạo Button/Input/FormField/Modal/Toast/StatusBadge/Skeleton/ErrorPanel.
3. Tạo focus ring, reduced motion, density.
4. Tạo Storybook + axe + visual baseline.
5. Viết usage/anti-pattern.

**Acceptance:** keyboard/a11y pass, không hard-code màu trong stories.

#### FE-F00-004 — API code generation

1. Validate OpenAPI.
2. Generate vào `packages/api-generated`.
3. Tạo typed transport wrapper.
4. Tạo Problem Details parser.
5. Tạo request metadata/idempotency/concurrency helper.
6. CI codegen diff check.

**Acceptance:** contract thay đổi làm compile/test fail có chủ đích; generated code không sửa tay.

#### FE-F00-005 — Query/state foundation

1. Tạo QueryClient factory theo app/environment.
2. Default retry theo mục 11.10.
3. Tạo query key conventions.
4. Tạo persistence policy adapter.
5. Devtools chỉ bật non-production.
6. Cache clear API cho logout/tenant switch.

#### FE-F00-006 — Realtime foundation

1. Tạo SSE client state machine.
2. Envelope validation/dedupe/version/gap.
3. Backoff/resume/resync.
4. Event router registry.
5. Mock SSE test harness.
6. Connection status UI.

#### FE-F00-007 — Permission/feature flag foundation

1. Generate typed registry.
2. Tạo provider, route/action/field gate.
3. Implement denied behaviors.
4. Test unknown permission/flag.
5. Telemetry mismatch.

#### FE-F00-008 — Telemetry/redaction

1. Tạo provider-neutral interface.
2. Scrub URL/query/request body.
3. Release/environment context.
4. Error boundary integration.
5. Development console adapter không log PII.

#### FE-F00-009 — Test infrastructure

1. Vitest + Testing Library.
2. MSW setup node/browser.
3. Schema-valid fixtures.
4. Playwright project/config.
5. Storybook test runner.
6. Coverage gate.
7. Test data factory.

#### FE-F00-010 — CI/CD baseline

1. PR pipeline mục 19.1.
2. Preview/staging deploy.
3. Bundle report.
4. Security scans.
5. SBOM/checksum skeleton.
6. Release metadata and rollback pointer.

### F00.5 Critical states

- Runtime config missing/invalid.
- API unavailable.
- Auth bootstrap pending/fail.
- Route chunk load fail.
- Permission/flag registry mismatch.
- SSE connecting/reconnecting/resync.
- Global JS error.

### F00.6 Exit criteria

- Vertical shell chạy trên dev/staging.
- Storybook publish được.
- OpenAPI/AsyncAPI pipeline hoạt động.
- Security/lint/type/test/build gate xanh.
- Một sample feature chứng minh layer/import boundary.
- Runbook local setup và CI troubleshooting hoàn chỉnh.

---

## F01 — Authentication, Tenant, User, RBAC và Device

### F01.1 Routes

```text
/login
/auth/callback
/2fa
/forgot-password
/reset-password
/accept-invite
/settings/tenant
/settings/users
/settings/roles
/settings/devices
```

### F01.2 Permission tối thiểu

```text
tenant.read
tenant.update
member.read
member.invite
member.update
role.read
role.write
authenticated
audit.read
```

Ghi chú: `device.read`/`device.revoke` không phải permission — quản lý device/session trong F01.6 là
self-service (user tự quản lý device của chính mình), nên guard tương ứng chỉ cần `authenticated`,
không có `device.*` trong permission catalog backend.

### F01.3 Contract bắt buộc

- OIDC/BFF flow và CSRF contract.
- `/session/bootstrap` schema.
- Login/2FA/invite/password error catalog.
- User/invite/role/device model.
- Permission registry và grouping metadata.
- Device revoke event/poll fallback.
- Session expiration/step-up policy.
- Multi-tenant switch contract nếu có.

### F01.4 Domain states

#### Invite

```text
pending → accepted
pending → expired
pending → revoked
expired → resent (new invite id)
```

#### User membership

```text
invited → active → suspended → active
active/suspended → removed
```

#### Device

```text
active → revoked
active → expired
```

### F01.5 Implementation steps

#### FE-F01-001 — Auth bootstrap and guards

1. Implement auth state machine.
2. Bootstrap session before protected routes.
3. Handle 401 refresh/expired/revoked.
4. Safe return URL.
5. Cross-tab logout.
6. Clear cache/local state on logout.
7. Unit/E2E auth race tests.

#### FE-F01-002 — Login/2FA/recovery

1. Build forms from approved field schema.
2. Generic credential error; không tiết lộ account tồn tại.
3. Rate-limit/cooldown UX.
4. 2FA resend/recovery behavior.
5. Session timeout/reauth modal.
6. Accessibility and password manager compatibility.

#### FE-F01-003 — Invite acceptance

1. Validate invite token server-side.
2. Render tenant/role summary an toàn.
3. Handle pending/expired/revoked/already accepted.
4. Complete profile/password/IdP join theo contract.
5. Redirect onboarding/dashboard.

#### FE-F01-004 — User management

1. Cursor/page list, search/filter status/role.
2. Invite modal với validation.
3. Pending invite resend/revoke.
4. Suspend/remove với confirm + reason nếu contract yêu cầu.
5. Không cho user tự xóa owner cuối cùng; server quyết định và trả code.
6. PII masking theo permission.

#### FE-F01-005 — Role editor

1. Load permission registry/group metadata.
2. Role detail có version/ETag.
3. Group checkbox hỗ trợ mixed state.
4. Hiển thị impacted user count nếu API cung cấp.
5. Save với conflict handling.
6. Cảnh báo self-lockout/last-admin dựa trên server error.
7. Audit reason cho role nhạy cảm nếu policy yêu cầu.

#### FE-F01-006 — Device sessions

1. List current/other devices.
2. Show app/OS/last seen/trust/revoked.
3. Revoke confirm.
4. Current-device logout behavior.
5. Remote revoke event test.
6. Desktop cache/credential purge test.

### F01.6 Critical errors

```text
AUTH_INVALID_CREDENTIALS
AUTH_MFA_REQUIRED
AUTH_MFA_INVALID
AUTH_SESSION_EXPIRED
AUTH_SESSION_REVOKED
INVITE_EXPIRED
INVITE_REVOKED
INVITE_ALREADY_ACCEPTED
USER_LAST_OWNER
ROLE_VERSION_CONFLICT
ROLE_WOULD_REMOVE_LAST_ADMIN
DEVICE_ALREADY_REVOKED
RATE_LIMITED
```

### F01.7 Security tests

- Open redirect.
- CSRF mutation.
- Session fixation/old session reuse.
- Token absent from storage/log/network URL.
- Cross-tab logout.
- Permission downgrade while page open.
- Self-lockout/last owner negative case.
- Device revoke remote logout.

### F01.8 Exit criteria

- Auth P0 E2E pass.
- Web token không xuất hiện trong JS storage.
- Desktop auth qua system browser + secure storage verified.
- Permission editor conflict-safe.
- Device revoke end-to-end.
- Audit actions có request ID/reason theo contract.

---

## F02 — Onboarding Wizard

### F02.1 Mục tiêu

Đưa tenant mới từ trạng thái chưa cấu hình đến khi có thể xử lý hội thoại, AI Copilot và đơn test mà không gửi nhầm dữ liệu cho khách thật.

### F02.2 Route và quyền

- `/onboarding`
- Owner/admin mặc định; từng step có permission riêng nếu cho delegate.
- Sandbox actions không được ảnh hưởng channel production.

### F02.3 Contract bắt buộc

- Onboarding progress model/version.
- Step dependency, required/optional/skip rules.
- Draft save/resume contract.
- Channel connect status.
- Product/knowledge readiness check.
- AI sandbox isolated endpoint.
- Test order marker và cleanup policy.
- Completion criteria do server tính.

### F02.4 State model

```text
not_started
→ in_progress
→ blocked
→ ready_for_review
→ completed

Mỗi step:
not_started | in_progress | completed | skipped | blocked | stale
```

`stale` dùng khi cấu hình sau đó thay đổi khiến step không còn hợp lệ.

### F02.5 Step specification

| Step | Input/output | Blocking rule |
|---|---|---|
| Shop | industry, timezone, currency | Bắt buộc |
| Team | invite/roles | Có thể skip nếu owner-only được phép |
| Channel | account connect/health | Cần ít nhất một channel hoặc sandbox mode |
| Catalog | import/create product | Cần catalog tối thiểu cho AI/order |
| Knowledge | policy/FAQ/ship | Cần published source tối thiểu theo industry |
| AI tone | tone, prohibited claims | Bắt buộc trước sandbox |
| AI sandbox | test cases/result/source | Không gửi channel thật |
| Copilot enable | feature/channel scope | Có confirm và rollback |
| Test order | synthetic customer/order | Không trừ tồn thật nếu policy sandbox |
| Dashboard | first metrics/readiness | Hoàn tất checklist |

### F02.6 Implementation steps

1. Tạo onboarding route shell và progress sidebar.
2. Load server progress/version; không tự đánh dấu completed.
3. Tạo per-step form với autosave debounce + explicit save status.
4. Resume đúng field/step sau refresh.
5. Validate dependency trước next/skip.
6. Render blocked reason và deep link sang module sửa lỗi.
7. Sandbox banner cố định; disable production send.
8. Completion summary hiển thị missing/stale checks.
9. Submit complete mutation có idempotency/version.
10. Redirect dashboard chỉ sau server confirmation.

### F02.7 UX safeguards

- Có `Save and exit`.
- Browser close/route leave cảnh báo khi unsaved.
- Step skip ghi rõ hậu quả.
- Channel OAuth callback quay lại đúng step.
- Import job có thể chạy background; onboarding theo dõi job.
- AI sandbox phải gắn nhãn dữ liệu test.
- Test order phải có marker và không gửi notification khách thật.

### F02.8 Tests

- New tenant happy path.
- Skip optional step.
- Refresh/resume.
- Version conflict từ hai tab.
- Channel token/scopes fail.
- Import partial fail.
- Knowledge unpublished.
- AI blocked/missing data.
- Completion server rejects stale step.

### F02.9 Exit criteria

- Tenant mới hoàn tất flow không cần thao tác DB/manual.
- Không có production side effect trong sandbox.
- Progress do server xác nhận.
- Resume/blocked/stale behavior pass E2E.

---

## F03 — Product, Variant/SKU, Category và Import

### F03.1 Routes

```text
/products
/products/new
/products/:productId
/products/import
/products/import/:jobId
```

### F03.2 Permission

```text
catalog.read
catalog.write
catalog.cost.read
catalog.cost.write
category.read
category.write
```

Ghi chú: permission catalog backend hiện chỉ có `catalog.read`/`catalog.write` (không có
`product.*`, không có action `publish`/`import` riêng) — write/publish/import đều dùng chung
`catalog.write`; nếu cần tách quyền publish/import riêng khỏi write thường (ví dụ hạn chế ai được
bulk-import hàng loạt) thì đó là permission mới chưa tồn tại, phải báo Contract Gap
(`frontend/docs/collaboration/OUTBOX.md`), không tự đặt tên `catalog.import`/`catalog.publish`.

### F03.3 Contract bắt buộc

- Product/variant/category schema.
- SKU uniqueness scope.
- Money/currency representation.
- Product/variant status state machine.
- Validation limits: name/SKU/options/images.
- Cost/price PII-like field authorization.
- Search/filter/sort/pagination.
- Import upload/mapping/validate/commit/job/report protocol.
- Large import limits và async events.
- Optimistic concurrency.

### F03.4 Product state machine

```text
draft → active → hidden → active
active/hidden → discontinued

Discontinued không được tự quay active nếu server policy cấm.
```

### F03.5 Product editor architecture

Tabs gợi ý, phải khớp UX contract:

```text
General
Variants & SKU
Pricing
Inventory link
Media
Channels/visibility
History
```

Form view model tách khỏi DTO. Money không dùng JS floating arithmetic.

### F03.6 Implementation steps

#### FE-F03-001 — Product list

1. URL-synced search/filter/sort.
2. Cursor pagination hoặc server paging.
3. Virtualize khi page/list lớn.
4. Permission-aware cost/profit columns.
5. Saved views nếu contract có.
6. Empty/error/stale states.
7. Bulk action chỉ khi Backend có contract idempotent/job.

#### FE-F03-002 — Product detail/editor

1. Load product + ETag/version.
2. Map DTO → form default.
3. Dirty tracking/leave warning.
4. Field-level server error mapping.
5. Save PATCH với `If-Match`.
6. Conflict UX: reload/copy changes; không ghi đè im lặng.
7. Status transition confirm.
8. Audit/history display.

#### FE-F03-003 — Variant matrix

1. Define option dimensions/limits từ config.
2. Generate combinations deterministic.
3. Preserve existing SKU/entity IDs.
4. Detect duplicate SKU client-side, server vẫn validate.
5. Large matrix performance test.
6. Bulk price/status edits có preview.
7. Unsaved/removed variant handling.

#### FE-F03-004 — Import workflow

Recommended API phases:

```text
create job/upload
→ parse headers/sample
→ submit mapping
→ validate
→ preview errors/summary
→ commit with idempotency
→ processing
→ completed | partial | failed | cancelled
```

UI steps:

1. Download template/version.
2. Upload with progress/cancel.
3. Detect sheet/header/encoding.
4. Column mapping với required fields.
5. Preview normalized rows.
6. Validation summary + row/column errors.
7. Download error file an toàn.
8. Confirm commit và impact count.
9. Track async job qua SSE/poll fallback.
10. Result report: created/updated/skipped/failed.

### F03.7 Import security/data quality

- Không execute macro/formula.
- Max size/row count từ server.
- Sanitize filename.
- CSV injection protection cho exported report.
- Duplicate detection policy rõ.
- Atomic/partial semantics do Backend công bố.
- Retry commit dùng cùng idempotency key.

### F03.8 Critical errors

```text
PRODUCT_VERSION_CONFLICT
PRODUCT_SKU_DUPLICATE
PRODUCT_INVALID_STATUS_TRANSITION
PRODUCT_COST_FORBIDDEN
IMPORT_UNSUPPORTED_FILE
IMPORT_TOO_LARGE
IMPORT_MAPPING_INVALID
IMPORT_VALIDATION_FAILED
IMPORT_JOB_EXPIRED
IMPORT_ALREADY_COMMITTED
IMPORT_PARTIAL_FAILURE
```

### F03.9 Tests

- Sale không thấy cost ở response/UI/cache.
- Product conflict.
- Variant combination preserve IDs.
- 50k-row import UI không freeze.
- Partial errors/report.
- Refresh/reopen import job.
- Double commit không duplicate.

### F03.10 Exit criteria

- Product CRUD/state transition/audit pass.
- Import end-to-end với schema-valid fixtures và staging.
- Cost permission negative tests pass.
- Performance đạt scale target.

---

## F04 — Inventory, Policy, Knowledge và AI Training Studio

### F04.1 Routes

```text
/inventory
/inventory/movements
/inventory/reservations
/knowledge
/knowledge/new
/knowledge/:sourceId
/knowledge/test
```

### F04.2 Permission

```text
inventory.read
inventory.movement.read
inventory.adjust
inventory.reservation.read
knowledge.read
knowledge.write
knowledge.approve
knowledge.publish
ai.sandbox.test
```

### F04.3 Inventory contract bắt buộc

- `on_hand`, `reserved`, `available` semantics.
- Warehouse/location dimension.
- Unit and decimal rules.
- Adjustment reason codes.
- Movement type catalog.
- Reservation state/TTL/ownership.
- Version/event schema.
- Permission/field visibility.

### F04.4 Inventory states

Reservation:

```text
pending → active → consumed
pending/active → released
active → expired
pending → failed
```

Adjustment request nếu có approval:

```text
draft → submitted → approved → applied
submitted → rejected
```

### F04.5 Knowledge states

```text
draft → in_review → approved → published → archived
in_review → changes_requested → draft
published → archived
```

AI chỉ dùng `published` theo server contract; UI không tự kết luận indexing đã hoàn tất.

### F04.6 Implementation steps — Inventory

1. Balance table với product/SKU/location filter.
2. Hiển thị ba quantity rõ và tooltip definition.
3. Movement timeline cursor paginated.
4. Adjustment modal: SKU/location/delta/reason/note.
5. Preview resulting quantity chỉ là estimate; server response là final.
6. Submit idempotent, no optimistic success.
7. Conflict/negative inventory/business block UX.
8. Reservation list/expiry countdown dựa server time.
9. Realtime inventory event → invalidate/refetch.

### F04.7 Implementation steps — Knowledge

1. List/filter status/type/source.
2. Editor có version/dirty/conflict.
3. Approval/publish actions có permission + confirm.
4. Render indexing/processing state.
5. Source attachment upload an toàn.
6. Published badge chỉ sau server confirmation.
7. AI test box trả answer + citations/tool result + QC/block reason.
8. So sánh source version used by test.
9. Archive/restore theo state machine.

### F04.8 AI Training Studio safeguards

- Sandbox không gửi khách thật.
- Prompt/system internals không hiện cho role không cần.
- Tool/source data có label rõ.
- Không cho copy restricted source nếu thiếu permission.
- Test case và feedback có PII policy.
- “Published” và “Indexed/Ready for AI” là hai trạng thái riêng nếu Backend có processing.

### F04.9 Critical errors

```text
INVENTORY_VERSION_CONFLICT
INVENTORY_INSUFFICIENT_AVAILABLE
INVENTORY_NEGATIVE_NOT_ALLOWED
INVENTORY_ADJUSTMENT_REASON_REQUIRED
RESERVATION_EXPIRED
RESERVATION_ALREADY_RELEASED
KNOWLEDGE_VERSION_CONFLICT
KNOWLEDGE_INVALID_TRANSITION
KNOWLEDGE_NOT_INDEXED
KNOWLEDGE_SOURCE_REJECTED
AI_TEST_BLOCKED
```

### F04.10 Tests/exit

- Quantity definitions đúng với fixtures.
- Adjustment double-submit không duplicate.
- Realtime update không ghi đè form/draft.
- Unpublished knowledge không được thể hiện “AI đang dùng”.
- Publish/indexing/test AI end-to-end.
- Permission/audit/concurrency pass.

---

## F05 — Channel Connect và Channel Health Center

### F05.1 Routes

```text
/channels
/channels/connect/:provider
/channels/callback/:provider
/channels/:channelId/health
```

### F05.2 Permission

```text
channel.read
channel.connect
channel.disconnect
channel.health.read
channel.reauthorize
channel.webhook.read
```

### F05.3 Contract bắt buộc

- Provider catalog và supported capabilities.
- OAuth start/callback/status flow.
- Account/page selection.
- Scope catalog + human impact.
- Channel account state machine.
- Health dimensions và severity.
- Reauthorization/disconnect semantics.
- No raw token response guarantee.
- Rate-limit/webhook/outbound status.

### F05.4 Channel state

```text
not_connected
→ authorizing
→ selecting_account
→ connected
→ healthy | degraded | authorization_expired | disconnected | disabled

degraded → healthy
authorization_expired → reauthorizing → healthy
connected/* → disconnected
```

### F05.5 OAuth connect flow

1. User chọn provider.
2. Client gọi `POST /channels/{provider}/authorization-session`.
3. Server trả authorization URL/session ID/state TTL.
4. Mở popup hoặc top-level redirect theo provider policy.
5. Callback chỉ gửi code/state về server; client không lưu token.
6. Nếu có nhiều page/account, server trả selection session.
7. User chọn account/scopes.
8. Server hoàn tất và trả channel account ID.
9. UI poll/SSE health đến trạng thái xác định.
10. Deep-link về channel health.

Popup blocked/cancel/expired/state mismatch phải có UX riêng.

### F05.6 Health Center dimensions

| Dimension | Ví dụ state |
|---|---|
| Authorization | valid/expiring/expired/missing_scope |
| Webhook | receiving/delayed/not_seen/error |
| Outbound | healthy/degraded/failing |
| Rate limit | normal/near_limit/limited |
| Subscription | active/missing/disabled |
| Last activity | timestamp/stale |
| Provider incident | none/known incident |

Health summary không chỉ là một badge; cần reason, impact, last checked, CTA.

### F05.7 Implementation steps

1. Channel account list/cards + capability badges.
2. Connect flow adapter theo provider, không hard-code Facebook vào core.
3. Callback recovery sau refresh.
4. Account/scope selection.
5. Health detail + history nếu API có.
6. Reauthorize CTA.
7. Disconnect confirm nêu impact đến inbox/send.
8. Degraded banner tích hợp Inbox/Order.
9. Realtime health event.
10. Support request ID/copy diagnostics không lộ token.

### F05.8 Critical errors

```text
CHANNEL_AUTHORIZATION_CANCELLED
CHANNEL_AUTHORIZATION_EXPIRED
CHANNEL_STATE_MISMATCH
CHANNEL_ACCOUNT_ALREADY_CONNECTED
CHANNEL_SCOPE_MISSING
CHANNEL_TOKEN_EXPIRED
CHANNEL_WEBHOOK_DEGRADED
CHANNEL_OUTBOUND_DISABLED
CHANNEL_RATE_LIMITED
CHANNEL_PROVIDER_UNAVAILABLE
```

### F05.9 Tests/exit

- OAuth callback success/cancel/expired/state mismatch.
- Popup blocked fallback.
- Không token trong URL/storage/log.
- Missing scope hiển thị đúng impact.
- Inbox thấy degraded state và không fail silently.
- Disconnect/reauthorize audit pass.


## F06 — Smart Inbox, Customer Context và Collaboration

### F06.1 Routes

```text
/inbox
/inbox/:conversationId
```

### F06.2 Permission

```text
conversation.read
conversation.reply
conversation.assign
conversation.status.write
conversation.note.read
conversation.note.create
conversation.takeover
customer.read
customer.pii.read
attachment.read
attachment.upload
```

### F06.3 Contract bắt buộc

- Conversation summary/detail schema.
- Message schema, channel type và delivery status.
- Customer profile/PII masking.
- Assignment/status/SLA/lead score/intent semantics.
- Internal note schema và visibility.
- Attachment upload/scan/download.
- Cursor pagination cho list và thread.
- Message idempotency/client ID.
- Realtime event payload/version/replay.
- Concurrency rule cho assignment/status.
- Channel capability: attachment, max length, reply window.
- Rate limit/outbound blocked codes.

### F06.4 Baseline state machines

#### Conversation

```text
open → pending_customer → open
open/pending_customer → resolved
resolved → reopened
resolved → closed
open/pending_customer/resolved → spam (permission riêng)
```

Backend có thể dùng tên khác nhưng phải cung cấp mapping/state transition; FE không tự cho phép transition.

#### Outbound message

```text
draft
→ submitting
→ accepted
→ sent
→ delivered
→ read

submitting/accepted/sent → failed
submitting → blocked
failed → retrying → accepted | failed
```

`accepted` nghĩa là Backend nhận command, không đồng nghĩa provider đã gửi.

#### Attachment

```text
selected → uploading → scanning → ready
uploading/scanning → rejected | failed
```

### F06.5 Layout và responsive behavior

Desktop standard:

```text
Conversation list | Message thread | Context panel
```

Minimum width:

- Conversation list có thể collapse.
- Context panel mở dạng drawer/tabs.
- Composer luôn giữ đủ action cốt lõi.
- User resizing panel phải có min/max và lưu preference.

### F06.6 Implementation steps

#### FE-F06-001 — Conversation list

1. Query cursor-paginated theo filter URL.
2. Filters: status, channel, assignee, SLA, hot lead, unread, intent theo contract.
3. Virtualize list.
4. Stable selection khi list realtime reorder.
5. Unread/SLA/score badge accessible.
6. Search debounce/cancel.
7. Empty/error/offline/stale.
8. Keyboard navigation up/down/enter nếu Design AI Agent xác nhận trong design-spec.

#### FE-F06-002 — Conversation route/detail

1. Route load summary + customer + first message page.
2. Unknown/not-found/forbidden tách rõ.
3. Deep link từ notification.
4. Mark read chỉ theo explicit server contract; không tự mark do render.
5. Conversation header status/assignee/channel health.
6. Preserve selected route khi list filter đổi nếu record vẫn hợp lệ.

#### FE-F06-003 — Message thread

1. Cursor load older messages.
2. Window/virtualize thread lớn.
3. Group theo day/sender nhưng giữ semantic.
4. Render plain text/sanitized rich content.
5. Delivery status timeline/tooltip.
6. Attachment safe preview/download.
7. Anchor/new message behavior không giật scroll.
8. Khi user đang đọc cũ, hiển thị “tin nhắn mới” thay vì auto-scroll.

#### FE-F06-004 — Reply composer

1. Draft namespace theo session/tenant/conversation.
2. Autosave local TTL.
3. Channel limit/capability indicator.
4. Attachment lifecycle.
5. Send tạo `client_message_id` + idempotency key.
6. Disable duplicate submit nhưng vẫn cho edit sau failed.
7. Accepted/sent/delivered state theo server/event.
8. Failed: reason, retry same logical action hoặc copy.
9. Channel disconnected/rate limited/reply window closed → blocked UX.
10. Draft clear chỉ sau server accepted theo policy; lưu recovery copy ngắn hạn nếu cần.

#### FE-F06-005 — Assignment/status/SLA

1. Assignee combobox server search.
2. Mutation có version/If-Match.
3. Conflict refetch.
4. SLA countdown dùng server deadline, không tự tính từ local timezone.
5. Transition menu sinh từ server allowed actions nếu có.
6. Audit reason cho spam/close nếu policy.

#### FE-F06-006 — Internal notes

1. Note composer khác visual rõ với reply.
2. Label “Chỉ nội bộ”.
3. Không dùng chung send shortcut mơ hồ.
4. Permission read/create.
5. Note event realtime.
6. Attachment note nếu contract cho phép.

#### FE-F06-007 — Customer context

1. PII fields qua `PiiField`.
2. Customer tags/history/last orders theo permission.
3. Link merge/update chỉ khi Backend contract.
4. Không cache restricted fields ngoài policy.
5. Customer detail error không làm thread crash.

#### FE-F06-008 — Human takeover

1. Hiển thị AI/human ownership state.
2. Takeover mutation + reason nếu cần.
3. Trong lúc pending, không gửi AI tự động.
4. Event update multi-agent.
5. Release takeover chỉ nếu state machine/permission cho phép.

#### FE-F06-009 — Realtime integration

1. Subscribe sau auth/bootstrap.
2. Dedupe message/event.
3. Update list summary/detail/thread.
4. Preserve composer/draft/focus.
5. Gap → resync.
6. Permission/channel health event.
7. Multi-tab behavior: tránh duplicate native notification nếu có leader election policy.

### F06.7 Keyboard shortcuts

Chỉ triển khai nếu có shortcut help và không xung đột assistive tech:

```text
Ctrl/Cmd + Enter: gửi reply khi user bật hoặc Design AI Agent xác nhận trong design-spec
Esc: đóng drawer/modal, không xóa draft
J/K hoặc Up/Down: di chuyển list nếu focus ở list
```

Không gửi bằng Enter đơn nếu multiline chat policy chưa phê duyệt.

### F06.8 Critical errors

```text
CONVERSATION_VERSION_CONFLICT
CONVERSATION_ALREADY_ASSIGNED
CONVERSATION_REPLY_FORBIDDEN
CONVERSATION_REPLY_WINDOW_CLOSED
MESSAGE_DUPLICATE
MESSAGE_CHANNEL_UNAVAILABLE
MESSAGE_RATE_LIMITED
MESSAGE_CONTENT_BLOCKED
MESSAGE_ATTACHMENT_REJECTED
MESSAGE_DELIVERY_FAILED
CUSTOMER_PII_FORBIDDEN
```

### F06.9 Tests

- Realtime new message khi đang gõ không mất draft/cursor.
- Duplicate/out-of-order event.
- Two-agent assignment conflict.
- Send double click/idempotency.
- Accepted rồi delivery failed.
- Offline draft → online revalidation.
- Channel health degraded.
- 5.000-message thread performance.
- PII hidden ở API/UI/cache/telemetry.
- Internal note không bao giờ đi outbound.

### F06.10 Exit criteria

- Sale xử lý conversation end-to-end trên staging.
- Message status đúng theo provider/server.
- Realtime resume/gap pass.
- Draft survive refresh/reconnect/crash theo policy.
- P0 inbox E2E, performance, accessibility pass.

---

## F07 — AI Copilot, Approval, Explainability và AI Administration

### F07.1 Routes/placement

```text
/inbox/:conversationId — AI panel
/ai/settings
/ai/logs
/ai/logs/:aiLogId
/ai/blocked
```

### F07.2 Permission

```text
ai.suggestion.generate
ai.suggestion.read
ai.suggestion.edit
ai.suggestion.send
ai.suggestion.approve
ai.configure
ai.log.read
ai.blocked.read
ai.source.read
ai.prompt_internal.read   # mặc định không cấp
```

### F07.3 Contract bắt buộc

- Suggestion request/response/job model.
- Suggestion state machine và expiry.
- Source citation/tool result/QC schema.
- Approval policy và approver roles.
- Block reason/error catalog.
- Send idempotency.
- Freshness rule khi price/inventory/knowledge thay đổi.
- AI log redaction/visibility.
- Usage/quota/latency metadata.
- Human takeover interaction.

### F07.4 Suggestion state machine

```text
not_requested
→ requesting
→ generating
→ ready_draft
→ edited
→ approval_required
→ approved
→ sending
→ sent

requesting/generating → generation_failed
ready_draft/edited/approval_required → blocked
ready_draft/edited/approved → expired
sending → send_failed
```

- MVP không auto-send.
- `blocked` không có đường send.
- `expired` phải regenerate/revalidate.
- `approved` có thể hết hiệu lực nếu source/version thay đổi.

### F07.5 AI response view model

```ts
interface AISuggestionViewModel {
  id: string;
  state: string;
  text: string;
  createdAt: string;
  expiresAt?: string;
  sourceSummary: Array<{
    id: string;
    type: 'product' | 'knowledge' | 'policy' | 'tool';
    label: string;
    version?: string;
    allowedToOpen: boolean;
  }>;
  qc: {
    status: 'passed' | 'warning' | 'blocked';
    reasons: string[];
  };
  approval?: {
    required: boolean;
    status: string;
  };
}
```

Không đưa raw system prompt/chain-of-thought vào UI/log. Chỉ hiển thị explanation/source đã được Backend chủ động thiết kế.

### F07.6 Implementation steps

#### FE-F07-001 — Suggestion request

1. Generate button theo permission/feature flag/channel state.
2. Gửi conversation ID + safe context reference; không gửi toàn bộ dữ liệu dư thừa nếu Backend đã có context.
3. Có request/job ID.
4. Loading có cancel UI chỉ nếu Backend hỗ trợ cancel.
5. Timeout không đồng nghĩa job failed; tiếp tục theo event/poll contract.

#### FE-F07-002 — Draft editor

1. Display suggestion as editable draft.
2. Preserve original/server version.
3. Track edited state và character/channel limits.
4. Không autosave raw sensitive draft ngoài policy.
5. Diff optional chỉ hiển thị human edit, không chain-of-thought.
6. Copy action permission/telemetry nếu cần.

#### FE-F07-003 — Sources/tool/QC

1. Source viewer có label/version/freshness.
2. Restricted source không mở nếu thiếu quyền.
3. Tool result hiển thị normalized facts, không raw internal payload.
4. Warning/blocked reason có remediation.
5. Nếu inventory/price stale, disable send và revalidate.

#### FE-F07-004 — Approval

1. Approval-required banner.
2. Request approval mutation nếu workflow cần.
3. Approver view với context và expiry.
4. Approve/reject có reason/audit.
5. Realtime approval event.
6. Permission revoked/expired handling.

#### FE-F07-005 — Send suggestion

1. User preview final text.
2. Backend evaluate/revalidate trước send.
3. Idempotency key + suggestion version.
4. Không optimistic “sent”.
5. Map send result vào message status.
6. Double-click không duplicate.
7. Blocked/expired/approval missing → actionable UX.

#### FE-F07-006 — AI settings

1. Typed settings schema/version.
2. Tone/allowed behaviors/prohibited claims/approval thresholds.
3. Feature/channel scope.
4. Save conflict handling.
5. High-risk change confirm + audit reason.
6. Sandbox test trước publish/apply nếu policy.
7. Kill switch rõ nhưng permission chặt.

#### FE-F07-007 — Logs/blocked outputs

1. Cursor list/filter by status/channel/model/date.
2. Redacted summary mặc định.
3. Detail theo permission.
4. Không hiển thị secrets/raw prompt/hidden reasoning.
5. Link conversation/request ID theo access.
6. Block reason taxonomy và remediation.
7. Export chỉ khi permission + audit.

### F07.7 Safety UX

- AI output luôn gắn nhãn draft/generated.
- Không dùng visual giống tin đã gửi.
- Warning không chỉ dùng màu.
- Sources không đồng nghĩa guarantee; copy nêu rõ nếu cần.
- Missing data phải dẫn tới nơi bổ sung product/knowledge.
- Emergency disable AI có immediate UI reaction qua feature flag/event.

### F07.8 Critical errors

```text
AI_FEATURE_DISABLED
AI_QUOTA_EXCEEDED
AI_CONTEXT_INSUFFICIENT
AI_GENERATION_TIMEOUT
AI_GENERATION_FAILED
AI_RESPONSE_BLOCKED
AI_APPROVAL_REQUIRED
AI_APPROVAL_EXPIRED
AI_SUGGESTION_EXPIRED
AI_SOURCE_VERSION_CHANGED
AI_SEND_REVALIDATION_FAILED
AI_LOG_FORBIDDEN
```

### F07.9 Tests

- Generate async ready/fail/timeout.
- Suggestion event duplicate/out-of-order.
- Edit then realtime update không mất edit.
- Blocked cannot send bằng UI/API mock negative.
- Approval state across two users.
- Source permission.
- Stale price/inventory prevents send.
- Kill switch while panel open.
- No raw prompt/PII in telemetry.

### F07.10 Exit criteria

- AI draft → edit → approval/block/send pass staging.
- No auto-send MVP.
- Source/QC/blocked behavior rõ và accessible.
- Safety/permission/audit tests pass.

---

## F08 — Order from Chat, Pricing, Reservation, Payment, Shipping và Printing

### F08.1 Routes/placement

```text
/orders
/orders/:orderId
/inbox/:conversationId — Order panel
```

### F08.2 Permission

```text
order.read
order.create
order.write
order.confirm
order.cancel
order.discount.apply
order.cost.read
payment.read
payment.record
shipment.read
shipment.create
packing_slip.read
packing_slip.print
customer.pii.read
```

### F08.3 Contract bắt buộc

- Order/customer/address/line item/pricing schema.
- Currency/minor unit/tax/discount/shipping calculation.
- Orthogonal status machines.
- Reservation TTL/failure/release/consume.
- Server quote/pricing snapshot and expiry.
- Payment method/status/refund scope.
- Shipment/carrier/status/tracking.
- Idempotency/concurrency/audit.
- Packing slip document API/layout/version.
- Send order summary to conversation.

### F08.4 Orthogonal state machines

#### Order lifecycle

```text
draft → pending_confirmation → confirmed → completed

draft/pending_confirmation/confirmed → cancelled
```

#### Pricing quote

```text
calculating → valid → expired
calculating → failed
valid → superseded
```

#### Reservation

```text
none → pending → active → consumed
pending → failed
active → released | expired
```

#### Payment

```text
unpaid → pending → partially_paid → paid
pending → failed
paid/partially_paid → partially_refunded | refunded
```

#### Fulfillment/shipment

```text
unfulfilled → preparing → shipped → delivered
preparing/shipped → failed
shipped/delivered → returned
```

UI không gộp mọi state vào một string duy nhất.

### F08.5 Order form model

Order form phải tách:

- Editable input: product/variant/quantity/customer/address/discount code/note.
- Server-calculated output: unit price snapshot, subtotal, discount, shipping, tax, total, available/reservation.
- Read-only audit/status/history.

Frontend không tự tính final total. Có thể tính preview để UX nhưng phải ghi `ước tính` và thay bằng server quote.

### F08.6 Implementation steps

#### FE-F08-001 — Order list/detail

1. Filter/sort/pagination theo server.
2. Status badges theo từng dimension.
3. Permission-aware cost/profit.
4. Detail load + ETag/version.
5. History timeline server-sourced.
6. Deep link conversation/customer/shipment theo permission.
7. Stale/conflict handling.

#### FE-F08-002 — Create draft from conversation

1. Prefill customer reference, không copy PII nếu không có quyền.
2. Product search server-side.
3. Variant selection và current available display.
4. Add line item local draft.
5. Request server quote/reservation theo explicit action.
6. Persist local draft safely; never mark order created before response.
7. Create order với idempotency key.
8. Server returns canonical order/quote/reservation/version.

#### FE-F08-003 — Product/quantity/reservation

1. Search cancellation/debounce.
2. Display available + timestamp.
3. Quantity validation local + server.
4. Reserve mutation no optimistic success.
5. Active reservation countdown từ server expiry.
6. Reservation event/refetch.
7. Expired/fail: highlight affected line, suggest adjust/remove/retry.
8. Revalidate before confirm.

#### FE-F08-004 — Customer/address

1. Address form schema theo country/tenant.
2. PII permission/masking.
3. Server normalize/validate; user confirm normalized suggestion nếu có.
4. Do not silently overwrite original input.
5. Save customer profile riêng chỉ khi user chọn và có permission.

#### FE-F08-005 — Quote/discount/total

1. Every impactful change marks quote stale.
2. Debounced quote request with cancellation.
3. Display quote version/expiry if relevant.
4. Discount action permission + reason/code.
5. Distinguish subtotal/discount/shipping/tax/total.
6. Cost/profit only from server and permission.
7. Confirm disabled if quote expired/calculating/conflict.

#### FE-F08-006 — Confirm order

1. Open summary modal with customer/address/lines/totals/reservation.
2. Require explicit confirmation.
3. Send order version, quote version, idempotency key.
4. Pending state.
5. Server response canonical confirmed state.
6. On 409/422 show price/stock/customer conflict diff.
7. Do not automatically retry non-retryable conflict.
8. Optionally send order summary via separate idempotent message action.

#### FE-F08-007 — Cancel order

1. Load allowed action/reasons.
2. Confirm impact: reservation/payment/shipment.
3. Reason required.
4. Mutation with version/idempotency.
5. Show server workflow status; cancellation may be async.
6. Reservation release shown only after server event/state.
7. Payment/shipment constraints/error remediation.

#### FE-F08-008 — Payment

1. Display payment summary/status.
2. Record/create payment only by permission.
3. Never collect/store raw card data unless PCI-compliant hosted component contract exists.
4. Redirect/hosted field state handling nếu online payment.
5. Pending/failed/duplicate webhook reconciliation UX.
6. Receipt/reference display safe.

#### FE-F08-009 — Shipment

1. Address/package/carrier/service selection from server data.
2. Server rate/label generation if supported.
3. Create shipment idempotent.
4. Tracking/status timeline.
5. Failure/retry rules.
6. Do not mark shipped before server confirmation.

#### FE-F08-010 — Packing slip/print

1. Request immutable print document.
2. PDF preview.
3. Download/print permission.
4. Native printer selection on Windows.
5. Print progress/result.
6. Reprint reason/audit if required.
7. No client recalculation of totals/address.

### F08.7 Critical errors

```text
ORDER_VERSION_CONFLICT
ORDER_INVALID_TRANSITION
ORDER_QUOTE_EXPIRED
ORDER_PRICE_CHANGED
ORDER_CUSTOMER_DATA_INVALID
ORDER_CONFIRMATION_DUPLICATE
ORDER_CANNOT_CANCEL
INVENTORY_INSUFFICIENT_AVAILABLE
RESERVATION_FAILED
RESERVATION_EXPIRED
DISCOUNT_FORBIDDEN
PAYMENT_DUPLICATE
PAYMENT_PENDING
PAYMENT_PROVIDER_UNAVAILABLE
SHIPMENT_CANNOT_CREATE
PRINT_DOCUMENT_GENERATION_FAILED
PRINT_DOCUMENT_EXPIRED
```

### F08.8 Tests

- Create double-click idempotency.
- Price changes while editing.
- Reservation expiry during confirm.
- Two agents edit same order.
- Payment pending then webhook updates.
- Cancel with active shipment/payment block.
- PII/cost permission.
- Offline only draft, no reservation/confirm.
- PDF hash/version and print flow.
- Recovery after browser/app crash.

### F08.9 Exit criteria

- Draft → quote/reserve → confirm → history end-to-end.
- Cancel/release reflected from server.
- Payment/shipping behavior matches contract.
- No client-side authoritative calculation.
- Order P0 E2E/security/concurrency/print pass.

---

## F09 — Dashboard, Reports và Operational Drill-down

### F09.1 Routes

```text
/dashboard
/reports
/reports/revenue
/reports/gross-profit
/reports/sla
/reports/ai-quality
```

### F09.2 Permission

```text
authenticated
report.read
report.revenue.read
report.profit.read
report.sla.read
report.ai_quality.read
report.export
```

Ghi chú: dashboard shell chỉ cần `authenticated`; mỗi panel/widget tự gate theo permission thật của
nó (`report.read`, `report.profit.read`, `report.export`, ...) qua `PermissionGate`, không có
`dashboard.read` trong permission catalog backend.

### F09.3 Metric contract bắt buộc

Mỗi metric phải có:

- ID/tên/định nghĩa.
- Formula owner Backend/Data.
- Timezone và date boundary.
- Included/excluded order statuses.
- Currency/multi-currency behavior.
- Comparison period.
- Freshness/last calculated.
- Permission/classification.
- Drill-down filter mapping.
- Null/zero/no-data semantics.

Ví dụ bắt buộc phân biệt:

```text
Revenue
Gross profit
Estimated net profit
Confirmed orders
Paid orders
Conversion rate denominator
SLA breached count
AI blocked rate
```

### F09.4 Implementation steps

#### FE-F09-001 — Dashboard shell

1. Global filter: date range/timezone/channel/sale/product theo contract.
2. URL-sync filter không chứa restricted PII.
3. Filter capability/permission.
4. Loading skeleton giữ layout.
5. Freshness/stale indicator.
6. Partial panel error không crash toàn dashboard.

#### FE-F09-002 — KPI cards

1. Value + unit/currency.
2. Comparison absolute/percent có baseline rõ.
3. Tooltip definition/formula link.
4. No-data khác zero.
5. Profit cards permission-gated và server-stripped.
6. Click drill-down tạo route/filter deterministic.

#### FE-F09-003 — Operational lists

- Hot leads.
- SLA breaches.
- Low stock.
- Best sellers.
- AI blocked issues.
- Channel degraded.

Mỗi list có owner action/deep link và pagination limit. Dashboard trả lời “cần làm gì”, không chỉ biểu đồ.

#### FE-F09-004 — Reports

1. Server-side aggregate/list.
2. Filter/sort/pagination.
3. Chart accessible table fallback.
4. Large export async job.
5. Export permission/audit.
6. Show generated_at/timezone/currency.
7. Report definition/version nếu cần đối soát.

#### FE-F09-005 — Realtime/freshness

1. Dashboard không patch số bằng client arithmetic.
2. Event chỉ trigger invalidate/refetch hoặc server-provided aggregate update.
3. Throttle refetch under high event volume.
4. Show stale when API/event unavailable.

### F09.5 Critical errors

```text
REPORT_PERMISSION_DENIED
REPORT_FILTER_INVALID
REPORT_DATA_STALE
REPORT_CALCULATION_IN_PROGRESS
REPORT_EXPORT_TOO_LARGE
REPORT_EXPORT_FAILED
REPORT_CURRENCY_NOT_SUPPORTED
```

### F09.6 Tests

- Metric zero vs no data.
- Timezone day boundary.
- Profit hidden from response/UI/cache.
- Drill-down filters match source metric.
- Partial API failure.
- Stale indicator.
- Export async job/rate limit.
- Large chart/list performance and accessible fallback.

### F09.7 Exit criteria

- Backend AI Agent (định nghĩa/đối chiếu số liệu) và Human Owner (xác nhận ý nghĩa nghiệp vụ) sign off metric definitions.
- Dashboard/order/revenue reconciliation sample pass.
- Permission/timezone/freshness tests pass.
- Operational drill-down actions usable.


## F10 — Windows Client Production

### F10.1 Entry criteria

- F00 platform stable.
- Auth desktop contract approved.
- Tauri capability threat model approved.
- Printing/update/signing infrastructure available.
- Inbox/order vertical slice works on Web first.

### F10.2 Workstreams

```text
Desktop shell and lifecycle
Native auth and secure storage
Device registration/revoke
Native notification
Offline draft/cache
Native printing
Crash recovery/telemetry
Signed installer/update
Enterprise deployment/support
```

### F10.3 Implementation steps

#### FE-F10-001 — Technical spike bắt buộc sớm

Trong Phase 1, trước khi feature Windows đầy đủ:

1. Build/install signed-development app.
2. Login qua system browser + PKCE.
3. Lưu session an toàn.
4. Gọi `/session/bootstrap`.
5. Kết nối SSE.
6. Hiển thị native notification an toàn.
7. Preview/print sample PDF.
8. Check signed update manifest.
9. Ghi report các blocker WebView2/proxy/antivirus/printer.

Spike thất bại phải được giải quyết trước khi đóng kiến trúc.

#### FE-F10-002 — Desktop shell

1. Single-instance behavior.
2. Window size/minimum/restore position.
3. Deep link/notification routing.
4. App menu/tray chỉ khi Human Owner duyệt.
5. Offline/update/version indicator.
6. Safe external link opening.
7. App lifecycle cleanup.

#### FE-F10-003 — Native authentication

1. External browser authorization.
2. Loopback/private redirect listener.
3. Validate state/PKCE.
4. Secure token/session storage in Rust/native layer.
5. Refresh/revoke/expiry.
6. Clear on logout.
7. Protect against concurrent login attempts.

#### FE-F10-004 — Device lifecycle

1. Generate stable app instance/device ID.
2. Register metadata minimal.
3. Heartbeat/last-seen policy.
4. Handle `device.revoked` event.
5. Purge credential/cache, close sensitive views, logout.
6. Device name edit nếu contract.

#### FE-F10-005 — Offline/read cache/draft

1. Encrypted local persistence.
2. Schema migrations.
3. TTL/quota/cleanup.
4. Offline banner + last sync.
5. Draft restore.
6. Revalidate on online.
7. No auto-confirm/send.
8. Logout/revoke purge tests.

#### FE-F10-006 — Notifications

1. Permission onboarding.
2. Safe content policy.
3. Deduplicate notification by event ID.
4. Suppress if relevant conversation focused, nếu Design AI Agent quyết định trong design-spec.
5. Click route after auth/access check.
6. Quiet hours/Windows settings link nếu roadmap.

#### FE-F10-007 — Printing

1. Download authorized immutable PDF.
2. Preview.
3. Enumerate printers through scoped native command.
4. Select paper/options allowed.
5. Print + result/error.
6. Retry/reprint audit policy.
7. Test physical/virtual printer matrix.

#### FE-F10-008 — Update/distribution

1. Version/channel config.
2. Signed manifest/package.
3. Background check, explicit install UX.
4. Draft-safe restart warning.
5. Minimum version/forced security update.
6. Failure/recovery.
7. Beta/stable promotion.
8. Code-signed installer.

#### FE-F10-009 — Enterprise readiness

1. Proxy/TLS inspection test.
2. Standard user install vs admin install policy.
3. MSI/NSIS deployment choice.
4. Antivirus/EDR false-positive process.
5. Silent install/update switches nếu IT yêu cầu.
6. Log location/retention/redaction.
7. Support diagnostic bundle không chứa PII/token.
8. Uninstall cleanup policy.

### F10.4 Desktop test matrix

| Area | Cases |
|---|---|
| OS | Supported Windows 11 editions/builds |
| Network | online, offline, flaky, proxy, DNS fail |
| Session | login, refresh, revoke, expired, clock skew |
| Display | 100/125/150/200% scale, multi-monitor |
| Printer | PDF driver, common office printer, unavailable/offline |
| Update | no update, optional, forced, signature invalid, interrupted |
| Lifecycle | crash, restart, sleep/wake, single instance |
| Security | capability abuse, external URL, local data/log inspection |

### F10.5 Exit criteria

- Signed installer/updater verified on clean VM.
- Supported Windows matrix pass.
- Secure storage/capability review pass.
- Desktop P0 E2E and crash-free target đạt pilot threshold.
- Rollback/recovery/support runbook hoàn chỉnh.

---

## F11 — Super Admin Portal, Tenant Health và Support Operations

### F11.1 Architecture

Super Admin:

- App, origin, OAuth client/audience, cookie/session, API gateway riêng.
- Không share runtime cache với Web Admin.
- Có stricter CSP/session/step-up.
- Shared UI package được phép; tenant feature code không được import tùy tiện.

### F11.2 Routes

```text
/tenants
/tenants/:tenantId
/tenants/:tenantId/health
/feature-flags
/alerts
/support-access
/ai-health
/channel-health
/audit-logs
```

### F11.3 Permission

```text
ops.tenant.read
ops.tenant_health
ops.feature_flag
ops.alert.read
ops.alert.acknowledge
support.access
ops.ai.disable
ops.channel.manage
ops.reprocess
ops.audit.read
```

Ghi chú: permission catalog backend hiện không có action `acknowledge` riêng cho alert
(`ops.alert.acknowledge`), không có `ops.ai.disable`/`ops.channel.manage` ops-scoped (chỉ có
`ai.disable`/`channel.manage` tenant-scoped) — đây là gap chưa có permission thật, phải báo Contract
Gap (`frontend/docs/collaboration/OUTBOX.md`) trước khi FE-F11-006 (Emergency actions) và phần
acknowledge của FE-F11-007 (Alerts/audit) wire guard, không tự đặt tên hoặc tái dùng permission
tenant-scoped cho hành động ops-scoped.

### F11.4 Contract bắt buộc

- Ops identity/step-up.
- Tenant health aggregate và severity.
- Support elevation token/scope/expiry.
- Feature flag version/audit/rollout schema.
- Emergency disable semantics.
- Alert lifecycle.
- Event reprocess idempotency/safety.
- PII redaction rules.
- Audit log immutable schema.

### F11.5 Support access state

```text
not_elevated
→ step_up_required
→ requesting
→ active
→ expiring
→ expired

requesting → denied
active → revoked
```

### F11.6 Implementation steps

#### FE-F11-001 — Ops auth/shell

1. Separate auth bootstrap.
2. Strict route/permission guards.
3. Session timeout/step-up.
4. Prominent ops environment/release banner.
5. No tenant data persisted by default.

#### FE-F11-002 — Tenant list/overview

1. Server-side search/filter/pagination.
2. Health summary, plan/status, last activity.
3. No customer PII in list.
4. Deep link health/flags/support.
5. Error isolation.

#### FE-F11-003 — Tenant health

1. Dimensions: API, channel, webhook, outbound, AI, jobs, usage, recent errors.
2. Severity + last checked + impact + runbook link.
3. Request/trace IDs safe.
4. Historical trend nếu contract.
5. No raw token/prompt/customer payload.

#### FE-F11-004 — Support elevation

1. Select tenant/scope/duration.
2. Reason/ticket required.
3. Step-up MFA.
4. Server grant.
5. Active banner/countdown.
6. Scoped tenant view/action.
7. Manual end/revoke/expiry.
8. Audit evidence.

#### FE-F11-005 — Feature flags

1. Typed registry and flag owner/description.
2. Tenant/cohort/environment targeting from server model.
3. Version conflict.
4. Change preview/impact.
5. Dangerous flag confirm/reason.
6. Scheduled rollout if contract.
7. Kill switch.
8. Audit/history/rollback.

#### FE-F11-006 — Emergency actions

Actions như disable AI/reprocess event:

1. Permission + step-up nếu cần.
2. Explain impact.
3. Require reason/reference.
4. Idempotency key.
5. No optimistic success.
6. Show final server state/audit/request ID.
7. Rate limit and duplicate handling.

#### FE-F11-007 — Alerts/audit

1. Alert list severity/status/owner.
2. Acknowledge/resolve workflow theo contract.
3. Deep link tenant/trace/runbook.
4. Audit filter/export permission.
5. Immutable record display.

### F11.7 Security tests

- Tenant user cannot access ops origin/API.
- Ops session cannot silently become tenant session.
- Elevation expires/revokes.
- Scope limitation negative test.
- No PII in health/alerts/logs without elevation.
- Feature flag conflict/double action.
- Emergency action audit reason.

### F11.8 Exit criteria

- Separate deployment/security review pass.
- Support access full lifecycle/audit pass.
- Kill switch tested in pilot.
- No cross-session/cross-origin cache leakage.

---

## F12 — Billing, Subscription, Usage và Entitlements

### F12.1 Routes

```text
/billing
/billing/usage
/billing/invoices
/billing/payment-methods
/billing/plan
```

Các sub-route chỉ bật nếu sản phẩm/billing provider hỗ trợ.

### F12.2 Permission

```text
billing.read
billing.usage.read
billing.invoice.read
billing.payment_method.write
billing.plan.change
billing.cancel
```

### F12.3 Contract bắt buộc

- Plan/entitlement/limit schema.
- Usage meter definition, reset time, freshness.
- Invoice/payment status.
- Hosted billing portal/checkout flow.
- Trial/grace/past_due/suspended state.
- Feature entitlement vs feature flag precedence.
- Tax/currency/provider compliance.
- Webhook reconciliation state.

### F12.4 Subscription state

```text
trialing → active
trialing → expired
active → past_due → active | suspended
active → cancelling → cancelled
cancelled → reactivated (nếu policy)
```

UI không tự khóa feature chỉ dựa trên plan label. Entitlement bootstrap từ server là nguồn quyết định.

### F12.5 Implementation steps

1. Billing overview: plan, renewal, status, owner.
2. Usage cards có definition/freshness/reset date.
3. Limit warning và deep link action.
4. Invoice list/download authorized URL.
5. Hosted payment method/checkout; không thu raw card data trong app nếu không có PCI scope.
6. Plan compare/change preview server-calculated.
7. Confirm upgrade/downgrade/cancel với effective date/impact.
8. Pending provider/webhook reconciliation state.
9. Entitlement/feature flag refresh event.
10. Past due/grace/suspended banners theo route/action policy.

### F12.6 Critical errors

```text
BILLING_PERMISSION_DENIED
BILLING_PROVIDER_UNAVAILABLE
BILLING_CHECKOUT_EXPIRED
BILLING_PLAN_CHANGE_NOT_ALLOWED
BILLING_USAGE_DELAYED
BILLING_PAYMENT_REQUIRED
BILLING_WEBHOOK_PENDING
ENTITLEMENT_REQUIRED
```

### F12.7 Tests/exit

- No raw payment data in app/log.
- Trial/active/past-due/suspended variants.
- Usage zero/no-data/delayed.
- Plan change double-submit/idempotency.
- Entitlement change updates UI safely.
- Invoice permission/download.

---

## F13 — Audit Logs, Notification Center, Attachments và General Settings

### F13.1 Scope

Module này hoàn thiện các phần cross-cutting thường bị bỏ sót trong workplan ban đầu:

- Tenant audit viewer.
- In-app notification center.
- Notification preferences.
- Attachment center/reusable upload state.
- General tenant/user preferences.
- Help/support diagnostics.

### F13.2 Routes

```text
/settings/audit-logs
/settings/notifications
/settings/tenant
/notifications
/help
```

### F13.3 Audit viewer

Contract:

- Actor/type/id.
- Action/resource.
- Occurred time.
- Reason/request ID.
- Before/after redacted diff nếu policy.
- Cursor pagination/filter.
- Immutable guarantee.

Implementation:

1. Filter by time/actor/action/resource.
2. Detail drawer.
3. Redact PII/secret.
4. Timezone rõ.
5. Export permission/audit.
6. No edit/delete.

### F13.4 Notification center

State:

```text
unread → read
unread/read → archived
```

Implementation:

1. Realtime badge/list.
2. Deduplicate by notification ID.
3. Safe deep link.
4. Mark read idempotent.
5. Notification preference theo event/channel.
6. Browser/native permission separate from product preference.
7. No sensitive content in preview by default.

### F13.5 Attachment foundation

Reusable attachment component phải hỗ trợ:

- select/drop/paste nếu allowed.
- size/type limits.
- upload progress/cancel/retry.
- scan/processing state.
- safe preview/download.
- expiry/deleted/not-found.
- permission.
- telemetry không chứa filename nhạy cảm/signed URL.

### F13.6 User/tenant preferences

- Locale/timezone/density/theme nếu supported.
- Save server vs local scope rõ.
- Version/conflict cho tenant setting.
- No business security setting chỉ local.
- Reset defaults.

### F13.7 Help/diagnostics

Support panel có:

- App version/build/environment.
- Connection state.
- Last request ID do user chọn.
- Device ID masked.
- Copy diagnostic bundle đã redact.
- Link privacy/support.

Không có token, customer payload, full local log.

### F13.8 Exit criteria

- Audit immutable/redacted.
- Notification realtime/deep link/read state pass.
- Attachment lifecycle dùng chung cho inbox/knowledge/import nếu phù hợp.
- Diagnostics được Security review.


# 22. Definition of Ready và Definition of Done

## 22.1 Definition of Ready — áp dụng cho mọi story

Story chỉ được chuyển sang `READY` khi tất cả mục bắt buộc là `PASS`.

### Human Owner / Design AI Agent

- [ ] Có user/persona và business outcome.
- [ ] Có route/entry point.
- [ ] Có design-spec (Design AI Agent) đã duyệt, kèm link/path tới file markdown.
- [ ] Có happy, loading, empty, error, forbidden, conflict, offline behavior phù hợp.
- [ ] Có copy/terminology do Design AI Agent soạn, Human Owner duyệt.
- [ ] Có acceptance criteria dạng Given/When/Then, đo được.
- [ ] Có out-of-scope.

### Domain/Backend contract

- [ ] OpenAPI operation có request/response/error example.
- [ ] AsyncAPI event có payload/version nếu cần realtime.
- [ ] Enum và state transition được chốt.
- [ ] Required/optional/nullability rõ.
- [ ] Permission/action/field masking rõ.
- [ ] Feature flag/entitlement rõ.
- [ ] Pagination/filter/sort rõ.
- [ ] Idempotency rule rõ cho write.
- [ ] Concurrency/version/ETag rõ.
- [ ] Rate-limit/retry behavior rõ.
- [ ] PII/data classification rõ.
- [ ] Mock fixture validate contract.
- [ ] Backend AI Agent và staging target có tên.

### Engineering/QA

- [ ] Query keys/cache policy xác định.
- [ ] Telemetry events/error capture xác định.
- [ ] Test cases happy/negative/security/a11y xác định.
- [ ] Performance/scale expectation xác định.
- [ ] Dependency/blocked tickets xác định.
- [ ] Rollout/feature flag/rollback behavior xác định cho risky feature.

### Hard blockers

Bất kỳ mục sau thiếu → `BLOCKED-CONTRACT`:

- API schema.
- State transition.
- Permission/PII rule.
- Idempotency cho critical write.
- Concurrency cho mutable critical entity.
- UX conflict/error behavior.

## 22.2 Definition of Done — story

### Code

- [ ] Code theo layer/import boundary.
- [ ] Không sửa generated code.
- [ ] Không có secret/PII fixture/log.
- [ ] Typecheck/lint pass.
- [ ] No uncontrolled `any`, non-null assertion hoặc dangerous HTML.
- [ ] Feature README/changelog cập nhật nếu cần.

### UX

- [ ] Đúng design/token/copy.
- [ ] Loading/empty/error/forbidden/offline/conflict đầy đủ.
- [ ] Pending/success state không gây double action.
- [ ] Keyboard/focus/label/zoom đạt baseline.
- [ ] Long text/locale/minimum viewport kiểm tra.

### Contract/security

- [ ] Generated client/fixture đúng contract.
- [ ] Permission negative test.
- [ ] PII redaction/server field absence kiểm tra.
- [ ] Idempotency/concurrency behavior test.
- [ ] Error code/request ID map đúng.
- [ ] Telemetry không chứa dữ liệu nhạy cảm.

### Tests

- [ ] Unit/component tests.
- [ ] Contract tests.
- [ ] E2E flow phù hợp risk.
- [ ] Accessibility automated/manual.
- [ ] Realtime/offline/race test nếu liên quan.
- [ ] Test xanh, không flaky mới.

### Delivery

- [ ] Staging integration pass.
- [ ] Frontend AI Agent xác nhận acceptance criteria (Given/When/Then) đạt; Human Owner xác nhận nếu ảnh hưởng business outcome quan trọng.
- [ ] Observability dashboard/event hoạt động.
- [ ] Feature flag/rollout cấu hình.
- [ ] Support/release note/runbook cập nhật nếu cần.

## 22.3 Definition of Done — module

Module chỉ hoàn tất khi:

- Tất cả P0/P1 journeys pass.
- Không còn contract gap critical/high.
- Performance scale target pass.
- Security review/negative permission/PII pass.
- A11y route/component gate pass.
- Staging soak ổn định.
- Dashboard/alert/runbook sẵn sàng.
- Rollback/kill switch được diễn tập.
- Human Owner (nghiệp vụ), Frontend AI Agent (test/kỹ thuật), Backend AI Agent sign-off.

## 22.4 Bug severity

| Severity | Định nghĩa | Release policy |
|---|---|---|
| S0 Critical | Cross-tenant, token/PII leak, wrong payment/order/inventory, RCE/updater tamper | Dừng release, incident ngay |
| S1 High | P0 flow không dùng được, data loss, duplicate send/order | Block release |
| S2 Medium | Feature quan trọng degraded, workaround có | Cần Human Owner phê duyệt (waiver) nếu release |
| S3 Low | Cosmetic/minor usability | Có thể backlog |

---

# 23. Lộ trình triển khai và backlog có thứ tự

Không tổ chức chỉ theo “màn hình”. Thực hiện theo vertical slice và dependency gate.

## Phase 0 — Governance, ADR và Contracts

**Exit gate G0:** mọi quyết định nền tảng và contract tối thiểu được duyệt.

| ID | Task | Phụ thuộc | Output |
|---|---|---|---|
| FE-P0-001 | Phê duyệt ADR-FE-001..018 | Architecture | ADR signed |
| FE-P0-002 | Chốt browser/Windows support matrix | Human Owner/IT | Support policy |
| FE-P0-003 | Chốt Web BFF/OIDC và Desktop PKCE | Backend AI Agent/Frontend AI Agent | Auth sequence diagrams |
| FE-P0-004 | Tạo OpenAPI tenant/ops baseline | Backend AI Agent | Valid specs |
| FE-P0-005 | Tạo AsyncAPI event baseline | Backend AI Agent | Valid specs |
| FE-P0-006 | Tạo permission matrix | Backend AI Agent/Human Owner | Typed registry source |
| FE-P0-007 | Tạo error catalog RFC 9457 | Backend AI Agent | Error YAML |
| FE-P0-008 | Tạo state machine catalog | Human Owner/Backend AI Agent/Frontend AI Agent | Approved diagrams |
| FE-P0-009 | Tạo PII/data classification | Frontend AI Agent/Backend AI Agent + Human Owner (pháp lý) | Field policy |
| FE-P0-010 | Chốt design-spec flows/states P0 | Design AI Agent/Human Owner | Versioned design-spec |
| FE-P0-011 | Chốt metric definitions | Backend AI Agent/Human Owner | Metric catalog |
| FE-P0-012 | Threat model (async, không phải workshop trực tiếp) | Frontend AI Agent + Backend AI Agent (kỹ thuật), Human Owner (risk acceptance) | Threat model v1 |

## Phase 1 — Platform và Technical Spikes

**Exit gate G1:** ba app build, codegen/test/CI hoạt động; desktop spike pass.

| ID | Task | Phụ thuộc | Output |
|---|---|---|---|
| FE-P1-001 | Bootstrap pnpm/Turbo/TS/ESLint | G0 | Repo foundation |
| FE-P1-002 | App skeleton 3 apps | P1-001 | Independent builds |
| FE-P1-003 | Runtime config/release metadata | P1-002 | Typed bootstrap |
| FE-P1-004 | Design tokens + primitives | Design AI Agent | Storybook baseline |
| FE-P1-005 | OpenAPI codegen/transport | P0-004 | Generated client |
| FE-P1-006 | Problem parser/retry/idempotency helpers | P1-005 | API core |
| FE-P1-007 | Query key/cache foundation | P1-001 | State core |
| FE-P1-008 | Permission/flag registry/gates | P0-006 | Typed policy UI |
| FE-P1-009 | SSE client/mock harness | P0-005 | Realtime core |
| FE-P1-010 | Telemetry/redaction/error boundaries | Frontend AI Agent | Observability core |
| FE-P1-011 | MSW/Vitest/Playwright/Storybook CI | P1-001 | Test platform |
| FE-P1-012 | Tauri auth/notification/print/update spike | P0-003 | Desktop feasibility report |
| FE-P1-013 | PR/staging pipeline/security scans | Frontend AI Agent | CI/CD baseline |

## Phase 2 — First Production Vertical Slice

Vertical slice được chọn:

```text
Login
→ session bootstrap
→ permission-aware shell
→ product list/detail read
→ error/request ID
→ SSE connection indicator
→ logout/cache purge
```

**Exit gate G2:** chứng minh architecture end-to-end trên staging.

| ID | Task | Output |
|---|---|---|
| FE-P2-001 | Web login/callback/session state | Auth vertical slice |
| FE-P2-002 | `/session/bootstrap` integration | User/tenant/permissions/flags |
| FE-P2-003 | Protected route/menu/403 | Permission vertical slice |
| FE-P2-004 | Product list query/filter/page | First generated API use |
| FE-P2-005 | Product detail read + 404/403 | Entity route |
| FE-P2-006 | Problem Details/request ID UI | Error vertical slice |
| FE-P2-007 | SSE connect/reconnect status | Event vertical slice |
| FE-P2-008 | Logout/cache/local purge | Session isolation |
| FE-P2-009 | P0 E2E/a11y/performance | Release evidence |
| FE-P2-010 | Architecture review retrospective | ADR adjustments nếu cần |

Không mở rộng đội sang toàn bộ feature trước khi G2 pass.

## Phase 3 — Tenant Administration, Onboarding và Catalog

**Exit gate G3:** tenant mới có thể cấu hình team/catalog/knowledge cơ bản.

| ID | Task | Module |
|---|---|---|
| FE-P3-001 | User/invite management | F01 |
| FE-P3-002 | Role/permission editor | F01 |
| FE-P3-003 | Device sessions/revoke | F01 |
| FE-P3-004 | Tenant settings | F01/F13 |
| FE-P3-005 | Onboarding shell/progress/resume | F02 |
| FE-P3-006 | Product create/edit/conflict | F03 |
| FE-P3-007 | Variant matrix | F03 |
| FE-P3-008 | Import upload/mapping/validation | F03 |
| FE-P3-009 | Import commit/job/report | F03 |
| FE-P3-010 | Inventory balances/movements | F04 |
| FE-P3-011 | Inventory adjustment/reservation views | F04 |
| FE-P3-012 | Knowledge editor/approval/publish | F04 |
| FE-P3-013 | AI sandbox/readiness | F04/F02 |
| FE-P3-014 | G3 integration/security/performance tests | All |

## Phase 4 — Channels và Smart Inbox

**Exit gate G4:** sale nhận và trả lời conversation với delivery/realtime đáng tin cậy.

| ID | Task | Module |
|---|---|---|
| FE-P4-001 | Provider adapter/channel list | F05 |
| FE-P4-002 | OAuth start/callback/account select | F05 |
| FE-P4-003 | Channel health/reauthorize/disconnect | F05 |
| FE-P4-004 | Conversation list/filter/virtualization | F06 |
| FE-P4-005 | Thread pagination/render/attachment | F06 |
| FE-P4-006 | Composer/draft/idempotent send | F06 |
| FE-P4-007 | Delivery status/failure/retry | F06 |
| FE-P4-008 | Assignment/status/SLA/conflict | F06 |
| FE-P4-009 | Internal notes/customer PII | F06 |
| FE-P4-010 | Human takeover | F06 |
| FE-P4-011 | Realtime cache merge/resume/gap | F06 |
| FE-P4-012 | Inbox P0 E2E/load/a11y/security | F06 |

## Phase 5 — AI Copilot và Order from Chat

**Exit gate G5:** AI draft an toàn và order server-confirmed end-to-end.

| ID | Task | Module |
|---|---|---|
| FE-P5-001 | AI request/job/realtime state | F07 |
| FE-P5-002 | Suggestion editor/source/QC | F07 |
| FE-P5-003 | Block/expiry/freshness | F07 |
| FE-P5-004 | Approval workflow | F07 |
| FE-P5-005 | Idempotent AI send/message linkage | F07/F06 |
| FE-P5-006 | AI settings/logs/blocked | F07 |
| FE-P5-007 | Order list/detail/history | F08 |
| FE-P5-008 | Draft from conversation/product picker | F08 |
| FE-P5-009 | Quote/reservation/expiry | F08 |
| FE-P5-010 | Customer/address/discount | F08 |
| FE-P5-011 | Confirm/conflict/idempotency | F08 |
| FE-P5-012 | Cancel/release | F08 |
| FE-P5-013 | Payment/shipment states | F08 |
| FE-P5-014 | PDF packing slip preview | F08 |
| FE-P5-015 | AI/Order safety/concurrency/E2E | F07/F08 |

## Phase 6 — Dashboard, Billing, Notifications và Super Admin

**Exit gate G6:** owner/support vận hành được và số liệu đối soát.

| ID | Task | Module |
|---|---|---|
| FE-P6-001 | Dashboard filters/KPI/freshness | F09 |
| FE-P6-002 | Operational lists/drill-down | F09 |
| FE-P6-003 | Reports/export jobs | F09 |
| FE-P6-004 | Billing overview/usage/invoices | F12 |
| FE-P6-005 | Plan/payment hosted flows | F12 |
| FE-P6-006 | Audit viewer | F13 |
| FE-P6-007 | Notification center/preferences | F13 |
| FE-P6-008 | Super Admin auth/shell | F11 |
| FE-P6-009 | Tenant health/alerts | F11 |
| FE-P6-010 | Support elevation | F11 |
| FE-P6-011 | Feature flags/kill switches | F11 |
| FE-P6-012 | Emergency actions/audit | F11 |
| FE-P6-013 | Metric/security/ops sign-off | All |

## Phase 7 — Windows Client Full Build

**Exit gate G7:** signed beta hoạt động trên supported Windows.

| ID | Task | Output |
|---|---|---|
| FE-P7-001 | Desktop shell/single instance/deep link | App lifecycle |
| FE-P7-002 | Production PKCE/secure session/device | Secure auth |
| FE-P7-003 | Shared Inbox/AI/Order integration | Core client |
| FE-P7-004 | Encrypted cache/draft/migrations | Offline safe |
| FE-P7-005 | Native notification | Desktop UX |
| FE-P7-006 | Native PDF print/printer matrix | Printing |
| FE-P7-007 | Crash recovery/diagnostics | Supportability |
| FE-P7-008 | Signed installer/updater/rings | Distribution |
| FE-P7-009 | Proxy/EDR/scale/display tests | Enterprise compatibility |
| FE-P7-010 | Beta pilot/telemetry | G7 evidence |

## Phase 8 — Pilot Hardening và Production

**Exit gate G8:** production release checklist 100%.

| ID | Task | Output |
|---|---|---|
| FE-P8-001 | Full regression/P0 journeys | QA evidence |
| FE-P8-002 | Performance/scale optimization | Budget pass |
| FE-P8-003 | Threat model refresh/pen test fixes | Security pass |
| FE-P8-004 | Accessibility audit fixes | WCAG evidence |
| FE-P8-005 | SLO dashboards/alerts/runbooks | Operations ready |
| FE-P8-006 | Pilot tenant cohort/feature flags | Controlled rollout |
| FE-P8-007 | Soak and incident drill | Reliability evidence |
| FE-P8-008 | Rollback/kill switch/update drill | Recovery evidence |
| FE-P8-009 | User/admin/support documentation | Adoption/support |
| FE-P8-010 | Go-live approval (Human Owner)/canary/promotion | Production |

## 23.1 Sprint planning rule

- Không gắn cứng phase với số sprint nếu năng lực xử lý song song của Frontend AI Agent/backend readiness chưa chốt.
- Mỗi sprint lấy vertical slice nhỏ hoàn thành DoD, không gom “toàn UI rồi tích hợp sau”.
- WIP limit cho mỗi luồng công việc song song của Frontend AI Agent.
- Contract work phải đi trước implementation ít nhất một refinement cycle.
- Mỗi phase có exit gate; không bỏ gate để “chạy tiến độ”.

## 23.2 Parallelization rule

Có thể song song:

- Design system và contract.
- Product/import với auth đã ổn.
- Windows technical spike từ Phase 1.
- Super Admin shell sau platform, nhưng support elevation chỉ sau security contract.

Không nên song song quá sớm:

- Inbox realtime trước SSE contract.
- AI send trước message/idempotency contract.
- Order confirm trước reservation/quote state machine.
- Desktop production trước auth/storage/signing spike.


# 24. RACI và cơ chế phối hợp

## 24.1 Vai trò

Dự án chỉ có 4 actor thật (không còn tổ chức người theo phòng ban): hai AI coding agent tự trị chạy bất đồng bộ ở hai repo riêng, một AI Agent soạn thảo thiết kế thay Figma, và một con người duy nhất giữ quyền quyết định rủi ro/nghiệp vụ.

| Role | Trách nhiệm chính |
|---|---|
| Frontend AI Agent | Kiến trúc/boundary theo ADR, chất lượng module, tích hợp; test strategy/automation/regression; CI/CD thường nhật; enforcement kỹ thuật cho auth/PII/telemetry/threat-model (qua `fe-architecture-reviewer`, `pii-telemetry-auditor`, `a11y-gap-reviewer`); render AI suggestion/QC theo hợp đồng backend; runbook/diagnostics cho sự cố không cần hạ tầng thật hoặc quyết định rủi ro |
| Backend AI Agent | OpenAPI, state machine, error catalog, staging, performance; AsyncAPI, replay/order/dedupe semantics; AI suggestion/QC/approval/block ở tầng orchestration backend; metric definition/reconciliation/freshness |
| Design AI Agent | Flow, design system, copy nháp, accessibility UX — toàn bộ dưới dạng design-spec markdown (thay thế Figma) |
| Human Owner | Outcome/scope/priority/business rule/acceptance nghiệp vụ cuối cùng; brand & copy sign-off; risk acceptance (threat-model waiver, security exception, waiver S2); signing key/production go-live; on-call cho sự cố ảnh hưởng khách hàng hoặc hạ tầng thật; trọng tài khi hai AI agent bất đồng |

## 24.2 RACI matrix

`R = Responsible`, `A = Accountable`, `C = Consulted`, `I = Informed`. Bốn cột dưới đây thay cho 9 cột role cũ; khi nhiều sub-role cũ gộp vào cùng một actor, ô lấy mức tham gia cao nhất trong các sub-role đó (ví dụ nếu một sub-role cũ là R và sub-role khác là C thì actor gộp nhận R).

| Artefact/Decision | Human Owner | Design AI Agent | Frontend AI Agent | Backend AI Agent |
|---|---|---|---|---|
| Product flow/AC | A | R | C | C |
| Design-spec/design token | C | A/R | C | I |
| ADR Frontend | C¹ | C | A/R | C |
| OpenAPI | C | I | C | A/R |
| AsyncAPI | C | I | C | A/R |
| Permission/PII matrix | A² | C | C | R |
| State machine | A | C | C | R |
| Frontend implementation | I | C | A/R | C |
| Test plan/acceptance | C | C | A/R | C |
| Security gate | I³ | I | A/R | C |
| CI/CD/signing | A⁴ | I | R | I |
| Metric definition | A | C | C | R |
| Production go-live | A | C | R | C |

¹ Human Owner chỉ thực sự "A" (phải phê duyệt) khi thay đổi ADR kéo theo đánh đổi rủi ro/kiến trúc thật; ADR thuần kỹ thuật tuân thủ baseline thì Frontend AI Agent tự accountable.
² Định nghĩa PII/permission ảnh hưởng nghĩa vụ pháp lý/nghiệp vụ nên Human Owner giữ Accountable; Backend AI Agent responsible cho schema, Frontend AI Agent consulted cho enforcement.
³ Human Owner chỉ tham gia khi security gate cần waiver/risk acceptance; gate deterministic do Frontend AI Agent tự accountable qua subagent review.
⁴ Frontend AI Agent thực thi toàn bộ CI/CD; Human Owner chỉ accountable cho phần signing key/production release.

## 24.3 Cadence

Frontend AI Agent và Backend AI Agent chạy bất đồng bộ, không có cuộc họp trực tiếp; thay lịch họp bằng gate kích hoạt theo sự kiện:

- Contract review: chạy trên mọi PR ảnh hưởng OpenAPI/AsyncAPI/permission/error contract, tự động qua contract test/codegen-diff trước khi merge — không chờ tới lịch tuần.
- Architecture/security review: trước khi bắt đầu bất kỳ ticket nào chạm code kiến trúc hoặc bảo mật nhạy cảm (auth, session, PII, signing) — Frontend AI Agent tự chạy `fe-architecture-reviewer`/`pii-telemetry-auditor` trước khi implement.
- Integration triage: ngay khi một module chuyển sang `READY-INTEGRATION` hoặc ngay khi contract test/staging fail — không chờ lịch cố định.
- Release readiness review: bắt buộc trước mỗi lần chuyển `READY-PILOT` → `READY-PRODUCTION`; Human Owner phải xác nhận go/no-go.
- Contract breaking change: thông báo ngay lập tức kèm migration window riêng, độc lập với mọi gate khác ở trên.

## 24.4 Contract gap SLA nội bộ

| Priority | Ví dụ | Xử lý |
|---|---|---|
| P0 | Block auth/order/send/security | Frontend AI Agent dừng ngay phần việc liên quan (`BLOCKED-CONTRACT`), ghi vào outbox của chính nó VÀ nói rõ trong output phiên làm việc rằng đây là block P0; không tự tiếp tục cho tới khi được giải quyết |
| P1 | Block một feature, không phải core an toàn/tiền bạc | Ghi vào outbox của chính nó, đồng thời Frontend AI Agent tiếp tục các phần việc khác không bị ảnh hưởng |
| P2 | UX/optional field | Ghi vào outbox, tiếp tục làm phần còn lại, xử lý lại khi có capacity kế tiếp |

Không dùng bảng này như cam kết khách hàng; đây là quy tắc nội bộ giữa hai AI agent và Human Owner, không phải cam kết theo lịch làm việc con người. **Không còn "decision queue" dùng chung** — mỗi
agent ghi vào outbox riêng của repo mình (`frontend/docs/collaboration/OUTBOX.md`,
`backend/docs/collaboration/OUTBOX.md`; lý do đổi từ 1 file dùng chung sang mô hình này: xem
`backend/docs/collaboration/OUTBOX.md`). Backend AI Agent transcribe mục cần Human Owner từ outbox
FE vào `backend/docs/collaboration/SIGNOFF_TRACKER.md`; Human Owner có thể đọc thẳng cả 2 file
outbox thay vì chờ bước transcribe này.

## 24.5 Escalation

Frontend AI Agent và Backend AI Agent chạy bất đồng bộ ở hai repo riêng, không có kênh trực tiếp để "hai bên ngồi bàn". Khi bất đồng xảy ra:

1. Viết ví dụ concrete request/response/state transition.
2. Xác định source of truth và rủi ro.
3. Áp dụng rule precedence đã viết sẵn (ADR, contract, spec) nếu có — dùng ngay, không cần bàn bạc thêm.
4. Nếu không có rule sẵn và đây thuần là bất đồng kỹ thuật, không có hệ quả nghiệp vụ/bảo mật: agent sở hữu contract/layer bị ảnh hưởng tự quyết định (Frontend AI Agent cho phần FE-side, Backend AI Agent cho phần BE-side/contract) và ghi ADR — không đợi phiên thảo luận đồng bộ.
5. Nếu là câu hỏi hành vi nghiệp vụ hoặc bảo mật/dữ liệu nhạy cảm: escalate Human Owner qua decision queue; Human Owner quyết định, không phải hai agent tự thương lượng.
6. Ghi ADR/contract revision; không giải quyết bằng code workaround ẩn.

---

# 25. Risk register và phương án kiểm soát

| ID | Rủi ro | Impact | Khả năng | Kiểm soát chính | Owner |
|---|---|---:|---:|---|---|
| R01 | FE và API lệch contract | High | High | OpenAPI codegen, fixture validation, contract test | Frontend AI Agent/Backend AI Agent |
| R02 | Cross-tenant cache leak | Critical | Medium | Session-scoped query keys, clear on switch/logout, negative E2E | Frontend AI Agent |
| R03 | PII lộ qua UI/log/telemetry | Critical | Medium | Server stripping, PiiField, redaction, security tests | Frontend AI Agent |
| R04 | Web token bị lấy qua XSS | Critical | Medium | BFF HttpOnly cookie, CSP, no token storage | Backend AI Agent/Frontend AI Agent |
| R05 | Desktop token/cache bị trích xuất | Critical | Medium | Native secure storage, encryption, capability review | Frontend AI Agent |
| R06 | Message gửi trùng | High | Medium | client_message_id, idempotency, disable duplicate, reconciliation | Frontend AI Agent/Backend AI Agent |
| R07 | AI draft gửi nhầm/blocked vẫn gửi | Critical | Medium | explicit send, state machine, server revalidation, negative tests | Frontend AI Agent |
| R08 | Order tạo/xác nhận trùng | Critical | Medium | idempotency, no optimistic success, confirm state | Backend AI Agent |
| R09 | Giá/tồn stale gây đơn sai | Critical | High | quote/reservation version/expiry, revalidate confirm | Backend AI Agent/Frontend AI Agent |
| R10 | Realtime duplicate/gap/out-of-order | High | High | event ID/version/sequence/replay/resync | Backend AI Agent/Frontend AI Agent |
| R11 | Realtime làm mất draft | High | Medium | draft state tách server cache, regression test | Frontend AI Agent |
| R12 | Permission stale sau role change | High | Medium | event/refetch bootstrap, 403 mismatch handling | Frontend AI Agent |
| R13 | Import lớn làm freeze/browser crash | High | Medium | async job, sample preview, worker/virtualization, limits | Human Owner (giới hạn nghiệp vụ)/Frontend AI Agent |
| R14 | File/CSV injection/malware | High | Medium | server scan, safe preview, formula escaping | Backend AI Agent/Frontend AI Agent |
| R15 | Dashboard metric gây hiểu sai | High | High | metric catalog, label/freshness/timezone, reconciliation | Backend AI Agent/Human Owner |
| R16 | Support access bị lạm dụng | Critical | Low/Med | separate app, step-up, scoped TTL, audit, watermark | Frontend AI Agent (kiểm soát kỹ thuật)/Human Owner (sign-off rủi ro) |
| R17 | Feature flag cấu hình sai | High | Medium | typed registry, preview, version, audit, kill switch | Frontend AI Agent |
| R18 | Dependency vulnerability/supply-chain | Critical | Medium | lockfile, SCA, allowlist, SBOM, signed artifacts | Frontend AI Agent |
| R19 | Desktop updater bị tamper | Critical | Low | signed update, clean-VM verify, minimum version | Frontend AI Agent (thực thi)/Human Owner (signing key) |
| R20 | Windows 10 unsupported gây security risk | High | Medium | Windows 11 baseline, ESU/LTSC waiver only | Human Owner/IT |
| R21 | Browser/desktop bundle quá lớn | Medium | Medium | budgets, lazy loading, bundle CI | Frontend AI Agent |
| R22 | Accessibility phát hiện quá muộn | High | Medium | design gate, Storybook axe, keyboard tests mỗi story | Design AI Agent/Frontend AI Agent |
| R23 | E2E flaky làm mất niềm tin CI | High | Medium | deterministic data, trace, quarantine SLA, no blind retry | Frontend AI Agent |
| R24 | Backend breaking change phá desktop cũ | High | Medium | compatibility window, contract version, min client version | Backend AI Agent/Frontend AI Agent |
| R25 | Raw AI prompt/source lộ cho role thường | High | Medium | dedicated permissions, redacted view models | Frontend AI Agent |
| R26 | Payment data mở rộng PCI scope | Critical | Low/Med | hosted checkout/fields, no raw card handling | Frontend AI Agent (kiểm soát kỹ thuật)/Human Owner (PCI sign-off) |
| R27 | Local draft tồn tại sau revoke | High | Medium | namespace/key purge, revoke test, TTL | Frontend AI Agent |
| R28 | Too many global states/coupling | Medium | High | server state in Query, module boundary, architecture review | Frontend AI Agent |
| R29 | AI agent tự phát minh business rule | High | High | DoR blocker, contract-gap protocol, scoped prompt | Frontend AI Agent |
| R30 | Rollback không dùng được do contract mới | Critical | Medium | backward compatibility window, rollback rehearsal | Backend AI Agent/Frontend AI Agent |

Mỗi risk High/Critical phải có owner, due date và evidence trong project tracker. Risk không có owner được xem là chưa được kiểm soát. Risk có Human Owner trong owner list bắt buộc có sign-off ghi trong tracker trước khi release, kể cả khi phần kiểm soát kỹ thuật do AI agent thực hiện.

---

# 26. Mẫu ticket, PR và prompt cho AI

## 26.1 Mẫu implementation ticket

```markdown
# [FE-XXX] <Tên task>

## Outcome
Người dùng nào đạt được kết quả gì?

## In scope
- ...

## Out of scope
- ...

## Entry point / routes
- ...

## Contracts
- OpenAPI operationId: ...
- AsyncAPI event: ...
- Permissions: ...
- Feature flags/entitlements: ...
- Error codes: ...
- Entity version/idempotency: ...

## UX
- Design-spec (Design AI Agent): <link/path tới frontend/docs/ux/design-specs/...>
- Required states: loading/empty/error/forbidden/conflict/offline/...

## Data classification
- Public/Internal/Confidential/Restricted
- Fields requiring masking: ...

## Acceptance criteria
Given ... When ... Then ...

## Test matrix
- Unit:
- Component:
- Contract:
- E2E:
- A11y:
- Security/race/offline:

## Telemetry
- Events:
- Error context:

## Dependencies
- ...

## Rollout
- Flag/cohort/rollback:

## DoR
- [ ] PASS
```

## 26.2 Mẫu Contract Gap

```markdown
# CONTRACT-GAP: <Tên>

## Blocked task
FE-XXX

## Missing/ambiguous item
Ví dụ: POST /orders/{id}/confirm chưa quy định 409 khi quote hết hạn.

## Why FE cannot safely assume
Ảnh hưởng đến duplicate, inventory, user message, test.

## Proposed contract example
Request:
...
Response:
...
Error:
...

## Required decision owners
Human Owner (business rule) / Backend AI Agent (API/data contract) / Frontend AI Agent (enforcement kỹ thuật nếu liên quan)

## Priority
P0/P1/P2
```

## 26.3 Mẫu Pull Request

```markdown
## Summary
- ...

## Ticket / Design-spec / Contract
- Ticket:
- Design-spec (Design AI Agent):
- OpenAPI/AsyncAPI version:

## Changed
- ...

## Security & data
- Permissions checked:
- PII handling:
- Idempotency/concurrency:
- No secrets/PII in logs:

## UX states
- [ ] Loading
- [ ] Empty
- [ ] Error + request_id
- [ ] Forbidden
- [ ] Conflict
- [ ] Offline/stale
- [ ] Keyboard/focus

## Tests run
- `pnpm ...`

## Evidence
- Screenshots/video/story URL/test report

## Rollout/rollback
- Feature flag:
- Rollback:

## Known risks / follow-ups
- ...
```

## 26.4 Prompt chuẩn cho AI coding agent

```text
Bạn là Frontend AI Agent (Claude Code) chịu trách nhiệm triển khai frontend của dự án AI Sales Operating System.

NGUỒN SỰ THẬT BẮT BUỘC:
1. FRONTEND_IMPLEMENTATION_SPEC_ENTERPRISE_GRADE_v2.0.md
2. OpenAPI/AsyncAPI hiện tại trong /contracts
3. permission-matrix.yaml, error-catalog.yaml
4. Ticket và design-spec (Design AI Agent) được cung cấp

TASK:
<dán ticket>

PHẠM VI FILE ĐƯỢC PHÉP SỬA:
<liệt kê thư mục/file>

QUY TẮC:
- Không phát minh endpoint, field, enum, permission hoặc state transition.
- Không sửa generated code.
- Không lưu token/PII hoặc log payload nhạy cảm.
- UI không gọi fetch trực tiếp.
- Server state dùng TanStack Query; không copy vào global store.
- Critical write phải tuân thủ idempotency/concurrency contract.
- Phải có loading, empty, error, forbidden, conflict/offline state phù hợp.
- Phải viết/cập nhật test.
- Không disable quality/security rule.

TRƯỚC KHI CODE, HÃY TRẢ:
1. Tóm tắt contract đã tìm thấy.
2. Assumption còn lại.
3. Danh sách file dự kiến thay đổi.
4. Kế hoạch test.
5. BLOCKED-CONTRACT nếu thiếu dữ liệu bắt buộc.

SAU KHI CODE, HÃY TRẢ:
1. File đã thay đổi.
2. Quyết định kỹ thuật chính.
3. Test/lint/typecheck/build đã chạy và kết quả.
4. Security/PII/a11y checks.
5. Rủi ro hoặc follow-up còn lại.
```

## 26.5 Prompt review code cho AI

```text
Bạn là Frontend AI Agent tự review thay đổi của chính mình (kết hợp góc nhìn `fe-architecture-reviewer` + `pii-telemetry-auditor`).
Không viết lại toàn bộ code. Hãy tìm lỗi theo thứ tự:
1. Cross-tenant/session/cache isolation.
2. Permission/PII leakage.
3. Idempotency, concurrency và race conditions.
4. API/AsyncAPI contract mismatch.
5. Realtime duplicate/out-of-order/gap.
6. Draft/data loss và offline behavior.
7. XSS/unsafe rendering/logging.
8. Accessibility/keyboard/focus.
9. Performance/rendering/bundle.
10. Test gaps.

Mỗi finding ghi: severity, file/line, scenario gây lỗi, cách sửa tối thiểu và test cần thêm.
Nếu không đủ contract để kết luận, ghi BLOCKED-CONTRACT thay vì đoán.
```

## 26.6 AI output acceptance

Không chấp nhận output AI chỉ có “đã code xong”. Output phải có:

- Contract referenced.
- Assumptions.
- Diff phạm vi nhỏ.
- Tests.
- Security/PII statement.
- Known risks.
- Không có generated diff ngoài dự kiến.

---

# 27. Checklist production release

## 27.1 Human Owner/contract

- [ ] P0/P1 scope được Human Owner sign-off.
- [ ] OpenAPI/AsyncAPI version immutable và deployed.
- [ ] Permission/error/state/metric catalogs synchronized.
- [ ] No critical contract gap.
- [ ] Backward compatibility với web rollback/desktop supported versions.
- [ ] Feature flags/entitlements/cohort configured.

## 27.2 Security/privacy

- [ ] Threat model current.
- [ ] ASVS baseline review complete.
- [ ] SAST/SCA/secret scan pass.
- [ ] Critical/high findings resolved hoặc approved waiver còn hạn.
- [ ] CSP enforced.
- [ ] Auth/CSRF/session/logout/revoke tests pass.
- [ ] Cross-tenant negative tests pass.
- [ ] Permission/PII/server field stripping tests pass.
- [ ] Telemetry/log redaction verified.
- [ ] Attachment/import/CSV security verified.
- [ ] Support access/step-up/audit verified.
- [ ] SBOM/checksum/artifact provenance generated.

## 27.3 Web application

- [ ] Runtime config valid.
- [ ] Route chunk/load recovery works.
- [ ] Browser matrix pass.
- [ ] Bundle/performance budgets pass.
- [ ] Error boundaries/request ID/support link work.
- [ ] Logout/tenant switch clears all scoped cache/draft per policy.
- [ ] Feature kill switch tested.

## 27.4 Realtime

- [ ] Connect/auth/heartbeat.
- [ ] Duplicate event.
- [ ] Out-of-order/old aggregate version.
- [ ] Sequence gap/resync.
- [ ] Replay after reconnect.
- [ ] Permission/device/flag event.
- [ ] Draft/focus preserved.
- [ ] Event schema error observable.

## 27.5 Business-critical flows

- [ ] Message idempotency/delivery failure.
- [ ] AI blocked/approval/expiry/send revalidation.
- [ ] Order quote/reservation/confirm/cancel conflict.
- [ ] Payment/shipment pending/reconciliation.
- [ ] Inventory adjustment/reservation.
- [ ] Product/import partial failure.
- [ ] Dashboard metric reconciliation.
- [ ] Billing entitlement/hosted payment.

## 27.6 Accessibility/UX

- [ ] Automated a11y no critical/serious.
- [ ] Keyboard P0 flows.
- [ ] Focus/modal/error association.
- [ ] Zoom/min viewport.
- [ ] No color-only status.
- [ ] Long Vietnamese text/locale/timezone/currency.
- [ ] Loading/empty/error/forbidden/conflict/offline screens reviewed.

## 27.7 Windows

- [ ] Supported OS clean install.
- [ ] Binary/installer signed.
- [ ] Updater manifest/package signature verified.
- [ ] System-browser PKCE and secure storage.
- [ ] Device revoke purge/logout.
- [ ] Encrypted draft/cache and migrations.
- [ ] Notification privacy/deep link.
- [ ] Printer matrix.
- [ ] Proxy/EDR/multi-display/scaling.
- [ ] Crash recovery/diagnostics.
- [ ] Beta/stable rings and rollback installer.

## 27.8 QA/operations

- [ ] Full P0 E2E pass; flaky tests within policy.
- [ ] Performance/load/soak pass.
- [ ] SLO dashboard/alerts active.
- [ ] Error tracker release/source maps registered privately.
- [ ] Runbooks: auth, SSE, channel, message, order, print, update.
- [ ] Human Owner sẵn sàng on-call; Frontend AI Agent đã diễn tập runbook.
- [ ] Incident/rollback/kill-switch drill completed.
- [ ] Release notes/known issues/user docs ready.

## 27.9 Go/No-Go rule

`NO-GO` khi có bất kỳ điều nào:

- S0/S1 bug mở.
- Cross-tenant/PII/security uncertainty.
- Message/order/payment/inventory idempotency chưa xác minh.
- Contract/rollback incompatibility.
- Desktop unsigned hoặc updater chưa verify.
- Không có Frontend AI Agent/Human Owner chịu trách nhiệm observability/rollback.

Production rollout:

```text
Internal
→ Pilot tenants
→ 5% canary
→ 25%
→ 50%
→ 100%
```

Promotion dựa trên SLO/error/business validation, không chỉ dựa trên thời gian.

---

# 28. Phụ lục contract mẫu

Các mẫu dưới đây minh họa cấu trúc bắt buộc. OpenAPI/AsyncAPI chính thức mới là nguồn sự thật.

## 28.1 Session bootstrap

```json
{
  "user": {
    "id": "usr_01",
    "display_name": "Nhân viên A",
    "locale": "vi-VN",
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "tenant": {
    "id": "ten_01",
    "name": "Shop Demo",
    "currency": "VND",
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "session": {
    "id": "ses_01",
    "version": 3,
    "expires_at": "2026-06-26T12:00:00Z"
  },
  "device": {
    "id": "dev_01",
    "trusted": true
  },
  "permissions": [
    "conversation.read",
    "conversation.reply",
    "order.create"
  ],
  "feature_flags": {
    "ai_copilot": {
      "enabled": true,
      "variant": "draft_only"
    }
  },
  "entitlements": {
    "max_users": 20,
    "ai_suggestions_monthly": 10000
  }
}
```

## 28.2 Problem Details

```json
{
  "type": "https://errors.example.com/inventory/insufficient-available",
  "title": "Insufficient inventory",
  "status": 409,
  "detail": "Sản phẩm không còn đủ tồn khả dụng.",
  "instance": "/orders/ord_01/confirm",
  "code": "INVENTORY_INSUFFICIENT_AVAILABLE",
  "request_id": "req_01",
  "trace_id": "trace_01",
  "retryable": false,
  "field_errors": [
    {
      "path": "lines[0].quantity",
      "code": "AVAILABLE_QUANTITY_CHANGED",
      "message": "Tồn khả dụng hiện tại là 2."
    }
  ],
  "meta": {
    "variant_id": "var_01",
    "requested": 3,
    "available": 2
  }
}
```

## 28.3 Send message command

```http
POST /conversations/{conversation_id}/messages
Idempotency-Key: 7c52e9ab-...
If-Match: "conversation-v42"
```

```json
{
  "client_message_id": "01JCLIENT...",
  "type": "text",
  "text": "Nội dung đã được người dùng xác nhận",
  "attachment_ids": [],
  "source": {
    "type": "human"
  }
}
```

Accepted response:

```json
{
  "message": {
    "id": "msg_01",
    "client_message_id": "01JCLIENT...",
    "status": "accepted",
    "version": 1,
    "created_at": "2026-06-26T08:00:00Z"
  }
}
```

## 28.4 Create/confirm order

```http
POST /orders
Idempotency-Key: 21b0...
```

```json
{
  "conversation_id": "con_01",
  "customer_id": "cus_01",
  "lines": [
    {
      "variant_id": "var_01",
      "quantity": 2
    }
  ],
  "customer_input": {
    "address_id": "addr_01"
  }
}
```

Canonical response must include:

```json
{
  "order": {
    "id": "ord_01",
    "version": 1,
    "lifecycle_status": "draft",
    "payment_status": "unpaid",
    "fulfillment_status": "unfulfilled"
  },
  "quote": {
    "id": "quote_01",
    "version": 1,
    "status": "valid",
    "expires_at": "2026-06-26T08:15:00Z",
    "currency": "VND",
    "subtotal_minor": 200000,
    "discount_minor": 0,
    "shipping_minor": 30000,
    "tax_minor": 0,
    "total_minor": 230000
  },
  "reservation": {
    "id": "res_01",
    "status": "active",
    "expires_at": "2026-06-26T08:15:00Z"
  }
}
```

Confirm:

```http
POST /orders/ord_01/confirm
Idempotency-Key: 890f...
If-Match: "order-v1"
```

```json
{
  "quote_id": "quote_01",
  "quote_version": 1,
  "reservation_id": "res_01"
}
```

## 28.5 SSE event

Wire format:

```text
id: evt_01J...
event: conversation.message_status_changed
data: {"id":"evt_01J...","type":"conversation.message_status_changed","schema_version":1,"subject":"conversation/con_01","aggregate_id":"msg_01","aggregate_version":3,"sequence":991,"occurred_at":"2026-06-26T08:01:02Z","correlation_id":"req_01","payload":{"message_id":"msg_01","status":"delivered"}}
```

## 28.6 Feature flag registry

```yaml
flags:
  - key: ai_copilot
    owner: ai-team
    default: false
    variants: [draft_only, approval, enabled]
    kill_switch: true
    expiry_date: null
    apps: [web-admin, windows-client]
    telemetry_required: true
```

## 28.7 Error catalog

```yaml
errors:
  - code: ORDER_QUOTE_EXPIRED
    http_status: 409
    retryable: false
    user_message_key: orders.errors.quoteExpired
    ui_action: refresh_quote
    support_severity: medium
  - code: MESSAGE_CHANNEL_UNAVAILABLE
    http_status: 503
    retryable: true
    user_message_key: inbox.errors.channelUnavailable
    ui_action: retry_or_copy
    support_severity: high
```

## 28.8 Realtime reducer pseudocode

```ts
function handleEvent(event: RealtimeEvent): void {
  if (seenEventIds.has(event.id)) return;
  seenEventIds.add(event.id);

  if (hasSequenceGap(event.sequence)) {
    requestResync();
    return;
  }

  const currentVersion = getCachedAggregateVersion(event.aggregateId);
  if (currentVersion !== undefined && event.aggregateVersion <= currentVersion) {
    return;
  }

  eventRouter.dispatch(event);
}
```

## 28.9 Platform-safe notification

```ts
interface SafeNotification {
  id: string;
  type: 'hot_lead' | 'order_update' | 'system';
  titleKey: string;
  bodyKey: string;
  route?: string;
  containsRestrictedData: false;
}
```

## 28.10 Unknown enum behavior

Khi runtime nhận enum chưa biết:

- Không crash.
- Hiển thị fallback `Trạng thái chưa được hỗ trợ`.
- Disable action có thể nguy hiểm.
- Ghi telemetry với operation/entity/status nhưng không PII.
- Refetch/config refresh.
- Tạo alert nếu tỷ lệ vượt threshold.

---

# 29. Danh sách artefact bắt buộc

Repository/project tracker phải có các artefact sau trước production:

```text
contracts/
├── openapi/tenant-api.yaml
├── openapi/ops-api.yaml
├── asyncapi/tenant-events.yaml
├── asyncapi/ops-events.yaml
├── permissions/permission-matrix.yaml
├── errors/error-catalog.yaml
├── metrics/metric-catalog.yaml
└── fixtures/<domain>/*.json

docs/
├── adr/ADR-FE-001..018.md
├── architecture/frontend-context.md
├── architecture/auth-sequence.md
├── architecture/realtime-sequence.md
├── architecture/order-state-machines.md
├── architecture/platform-adapters.md
├── threat-model/frontend-threat-model.md
├── security/data-classification.md
├── security/telemetry-redaction.md
├── ux/screen-state-matrix.md
├── ux/content-glossary.md
├── quality/test-strategy.md
├── quality/performance-plan.md
├── release/web-release-runbook.md
├── release/windows-release-runbook.md
├── runbooks/auth-session.md
├── runbooks/realtime.md
├── runbooks/channel-health.md
├── runbooks/message-delivery.md
├── runbooks/order-reservation.md
├── runbooks/printing.md
└── runbooks/desktop-update.md
```

Project management artefacts:

- RACI.
- Risk register.
- Contract gap board.
- Release evidence checklist.
- Dependency/waiver register.
- Browser/OS/printer test matrix.
- Feature flag inventory và removal dates.
- Supported client/API compatibility matrix.

---

# 30. Tiêu chuẩn tham chiếu

Baseline tại ngày 2026-06-26:

- OWASP Application Security Verification Standard 5.0 — security verification baseline.
- OWASP AI/LLM verification guidance — AI-facing controls phù hợp phạm vi.
- W3C Web Content Accessibility Guidelines 2.2, Level AA.
- OpenAPI Specification 3.1.1 cho contract hiện tại; 3.2 chỉ nâng khi toolchain được chứng nhận.
- AsyncAPI Specification 3.1.0 cho event contract.
- RFC 9457 — Problem Details for HTTP APIs.
- RFC 9700 — OAuth 2.0 Security Best Current Practice.
- RFC 8252 — OAuth 2.0 for Native Apps.
- React 19 stable line.
- Vite 8 stable line.
- Node.js 24 LTS.
- TypeScript 6 stable line.
- Tauri 2 security/capabilities/updater/signing documentation.
- Playwright cho cross-browser E2E.
- WCAG guidance cho hybrid/native WebView khi áp dụng Windows client.

Phiên bản patch thực tế phải pin trong repository và cập nhật theo security release. Không diễn giải danh sách này là giấy chứng nhận compliance; compliance phải có evidence test/review cụ thể.

---

# Kết luận triển khai

Tài liệu này thay đổi cách khởi động Frontend từ “có danh sách màn hình rồi bắt đầu code” sang quy trình có kiểm soát:

```text
Architecture/Contract approved
→ Platform foundation
→ First vertical slice
→ Domain modules theo dependency
→ Contract + security + test gates
→ Pilot with feature flags
→ Canary
→ Production with rollback
```

Frontend AI Agent được phép bắt đầu ngay các task Phase 0–1. Business feature chỉ bắt đầu khi đạt Definition of Ready. Không có contract thì tạo Contract Gap; không tự suy đoán. Không có server confirmation thì không hiển thị business success. Không có security/test/release evidence thì chưa được coi là production-ready.

