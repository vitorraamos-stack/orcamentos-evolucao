# 19V-C1 — Applied privileged-grant restriction

**Applied in production Supabase:** `20261016124926_phase_19vc1_revoke_dangerous_legacy_table_privileges` (project `zffpvykekwrmkbyjsgbh`).

The SQL in this repository is **the exact 3,557-character statement read from the database's recorded migration history**, not a new request to execute SQL. It was already applied once using the official migration action (`success: true`). Never reapply this version manually to the database where it is registered.

## Applied scope
Only client-facing privileges changed: `anon` and `authenticated` lost `TRUNCATE`, `TRIGGER`, `REFERENCES` on `public.os`, `public.os_event`, `public.os_payment_proof`. No data manipulation, table alteration, trigger change, RLS policy change, or RPC change occurred.

## Post-application verification
All six client/table combinations lack these three administrative privileges. All three tables retain RLS and existing authenticated SELECT/INSERT/UPDATE/DELETE. The `service_role` maintains `TRUNCATE`. The 19V-A RPC remains `SECURITY INVOKER` with MD5 `cc781eed0a4c590edb7facc4c9a731fd`; the 19T proof guard remains MD5 `8af26088723a9b4fb8dfb8863108affc`.

## Remaining 19V-C2 work
Clients still have direct UPDATE on `os.payment_status` and INSERT rights on `os_event` (subject to RLS). The broader SQL candidate in `docs/tasks/phase-19vc-financial-write-guards-CANDIDATE.sql` is **not applied**. It requires validation of its `SECURITY DEFINER` implementation, exposed schema configuration, existing integrations, authenticated concurrency and an independent deployment decision. No new payment records were used for testing.

Supabase security advisor retains previous unrelated findings; see the existing advisor warning for authenticated SECURITY DEFINER executable functions.
