# ADR-009 — Product Engineering service boundary

## Decision

The browser is not an authority for Product Engineering mutations. It sends authenticated commands to `/api/product-engineering`; the server validates the canonical shared domain and authorizes the manager role before using its server-only service-role credential.

Postgres RPCs provide transactional persistence. Draft replacement locks the version and checks `expectedRevision`, then increments it exactly once. Publication is serialized by a Product row lock and compares the server-observed current published version with a NULL-safe expectation before retiring/publishing versions atomically.

PostgreSQL `numeric` values cross JSON boundaries as strings and are validated as `DecimalString`; they never pass through JavaScript `number`. Schema and expression-AST versions are checked fail-closed before interpretation.

The RPCs are internal: execute is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`. RLS remains defense in depth.

## Consequences

All current reads and writes use one stable backend boundary. Domain validation remains TypeScript authority for structure and semantics, while PostgreSQL remains authority for locks, lifecycle invariants, concurrency, and atomicity.
