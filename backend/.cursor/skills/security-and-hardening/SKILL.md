---
name: security-and-hardening
description: Security-first patterns for multi-tenant backend. Use when handling auth, RLS, user input, webhooks, PII, payment data, or AI orchestration boundaries. Use for BE-IDN-*, BE-PAY-*, BE-AI-*, and any trust-boundary work.
---

# Security and Hardening

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT).

## Prime directive

Server establishes tenant context — never trust client `tenant_id` for authorization. RLS on all tenant-owned data. AI zero-trust: no direct business DB access.

## When to use

- Authentication, authorization, session handling
- RLS policies and tenant-scoped queries
- Webhooks, file uploads, external API integration
- Payment, PII, audit-sensitive flows
- AI tool calls and prompt/context handling

## Threat model (5 min)

1. Map trust boundaries: HTTP, webhooks, queues, third-party APIs, **LLM output**
2. Name assets: credentials, PII, payment data, admin actions
3. STRIDE each boundary — design controls, not guesses

## Always do

- Validate external input at system boundary
- Parameterize all SQL; RLS enforced in DB
- Hash secrets; never log PII, tokens, raw prompts
- Authorization check on every protected operation (not just authentication)
- Idempotency on critical mutations
- `pnpm verify` before claiming done

## Never do

- Commit secrets; expose stack traces to clients
- Trust client-side validation as security boundary
- Pass LLM output to SQL, shell, or unvalidated handlers
- Skip RLS on tenant-owned tables
- Log raw prompts or provider tokens

## Multi-tenant specifics

- Tenant context set server-side per request/job
- Composite tenant FKs; tenant-scoped indexes
- Cross-tenant data in AI context is forbidden

## AI / LLM (BE-AI-*)

- Treat model output as untrusted input
- Tool permissions scoped; destructive actions require gates
- No secrets or cross-tenant data in prompts
- Follow blueprint §13 AI governance

## Verification

- [ ] Tenant isolation tested (negative case)
- [ ] Permission negative test for new endpoints
- [ ] No secrets in diff or logs
- [ ] RLS policy updated if schema changed
- [ ] Webhook signature verification where applicable
