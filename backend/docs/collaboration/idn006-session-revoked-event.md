# Identity session-revoked event / SSE hook (BE-IDN-006)

**Status:** Documented for FE poll/SSE wiring  
**Event type:** `com.aisales.identity.session-revoked.v1`  
**Emitted via:** outbox (`app.outbox_events`) on logout, session revoke, device revoke

## Payload (minimum)

```json
{
  "session_id": "<uuid>",
  "user_id": "<uuid>",
  "device_id": "<uuid>",
  "reason": "logout|session_revoke|device_revoke",
  "close_sse": true
}
```

## Consumer rules

1. **SSE:** when `close_sse=true`, close any open `/api/v1/realtime/stream` connection bound to `session_id`.
2. **Poll fallback:** FE may poll `GET /me`; revoked session → `401 AUTH_UNAUTHORIZED` / `AUTH_SESSION_REVOKED`.
3. **Web Admin:** after `POST /auth/logout`, cookies are cleared client-side via `Set-Cookie` Max-Age=0; do not wait for SSE.

## Note

Full AsyncAPI channel entry can be added in a contract gap pass; runtime already writes the outbox event type above.
