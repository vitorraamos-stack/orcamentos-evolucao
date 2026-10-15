# 19V-A — Supabase migration application record

**STATUS: Applied in Supabase; GitHub migration history synchronized in this Draft PR.**

- Project: `evolucao-orcamentos` (`zffpvykekwrmkbyjsgbh`)
- Supabase migration history: `20261015134750_phase_19va_atomic_payment_finalization`
- Applied on: 2026-10-15, using the official Supabase migration connector
- Applied source: candidate `docs/tasks/phase-19va-migration-CANDIDATE.sql`
  from commit `d6054bbb25de434d733450dd70f6d43559a070b4`
- Corresponding repository file:
  `supabase/migrations/20261015134750_phase_19va_atomic_payment_finalization.sql`
- The repository migration was created **after** connector execution
  using the **actual Supabase-generated version**. The Supabase CLI was
  unavailable; do **not** claim the CLI generated or tested this file.
- No merge and no manual Vercel deployment were authorized/performed.

## Read-only verification after applying

1. `public.finalize_legacy_payment_submission(uuid)` exists,
   `SECURITY INVOKER` (`prosecdef=false`), empty search path, owned by postgres.
2. `authenticated` has EXECUTE; `anon` and `service_role` **do not**.
3. New index `os_event_payment_submission_once` is unique and applies to
   `PAYMENT_SUBMITTED` events with `payment_id` present.
4. The 19T proof guard remains unchanged, MD5
   `8af26088723a9b4fb8dfb8863108affc`.
5. Policies for updating `os`, adding/deleting `os_event` and updating
   `os_payment_proof` remain as they were before this phase.
6. Legacy `os`, `os_payment_proof` and `os_event` retained zero rows
   immediately after applying. This does not characterize newer Hub OS data.

## Exact scope and limitations

This is an **additive backend change only**. The existing frontend
still writes `os.payment_status` and `PAYMENT_SUBMITTED` separately.
The transactional RPC has **not been used by the frontend**.

- No synthetic financial transactions were written to production.
- No real RLS/JWT, idempotency, concurrency, rollback or R2/SMB E2E
  tests were performed. GitHub CI/static contracts are not substitutes.
- Direct UPDATE/INSERT/DELETE paths remain accessible under existing
  RLS. Full enforcement is **NOT** complete until separate 19V-B
  (frontend adoption) and 19V-C (server-side direct write restrictions).
- Event deletion by manager and tampering through existing direct-write
  paths still require review; the 19V-A RPC by itself is insufficient.
- Supabase security advisors reported pre-existing lints outside
  this narrowly scoped migration; no unrelated schema changes were made.

## Next authorization gates

1. Review and **separately authorize merge** of this migration-history PR.
   Until then the PR remains Draft even though the DB migration is applied.
2. Before 19V-B, specify retry semantics for already submitted proofs
   and refresh `os` / `os_event` after the RPC.
3. 19V-B frontend changes and 19V-C enforcement are different PRs and
   require separate authorization to merge / apply migrations.
4. Do not configure sandbox or modify client records to produce
   fake E2E evidence.
