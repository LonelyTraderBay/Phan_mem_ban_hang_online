# W2 — AsyncAPI (events)

**Status:** Not started  
**Depends on:** W1 in progress or Done (may overlap after Auth/Order event shapes exist)

## Goal

Complete tenant + ops event contracts so agents never invent event names/payloads.

## Exit criteria

- [ ] Tenant domain events cover backlog domains that publish/consume
- [ ] `ops-events` no longer an empty stub for planned ops alerts/support events
- [ ] AsyncAPI validate pass

## Notes

Prefer event names already listed in blueprint §9 / backlog; version every payload.
