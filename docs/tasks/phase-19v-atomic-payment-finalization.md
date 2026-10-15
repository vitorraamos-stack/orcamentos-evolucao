# EvoluSystem — Phase 19V: atomic legacy payment finalization

**Status: DESIGN PROPOSAL ONLY.** The owner asked to continue without configuring
a sandbox. This PR does **not** modify application behavior, Supabase migrations,
functions, data, RLS, production settings, R2 objects or deployment workflows.

## Verified baseline (15 October 2026)

- Legacy frontend `src/modules/hub-os/pages/OsDetailPage.tsx` performs
  `updateOs(payment_status)`, then separately `createOsEvent(PAYMENT_SUBMITTED)`.
  A failure after the first write can leave an inconsistent financial state.
- Phase 19T remains the last migration (`20261014185916`) on production.
  Existing `guard_legacy_payment_proof_mutations()` body MD5:
  `8af26088723a9b4fb8dfb8863108affc` (SECURITY INVOKER).
- In the snapshot, `public.os`, `public.os_payment_proof`, and
  `public.os_event` contain **zero legacy rows**. This is not proof that
  other, newer OS tables are empty.
- `public.os_event` has no uniqueness constraint for `PAYMENT_SUBMITTED`
  by payment ID; `os_event_insert` allows `hub_os` users to insert
  events, and `os_update` allows the same role to change status directly.
  A transactional RPC must be combined with a **separate direct-write
  enforcement review** before describing financial invariants as global.

## Architecture decision (proposed)

**One PostgreSQL RPC per finalization**:

`public.finalize_legacy_payment_submission(p_proof_id uuid)` using
`SECURITY INVOKER`, an empty `search_path` and explicit EXECUTE for
`authenticated` only. Never accept amount, user ID, OS ID or target status
from the browser. Identify the receipt by ID, check `auth.uid()`, module
access and its owner, then lock the parent OS row before its proof row.
Reuse the existing frontend rule for status determination, but compute
the current date on the server in `America/Sao_Paulo`.

Within **one database transaction**, verify attachment metadata, update
`public.os.payment_status`, and append `PAYMENT_SUBMITTED` to
`public.os_event`. An INSERT error must roll back the OS UPDATE. Return
an explicit `already_submitted` marker on repeated calls with the same
proof ID. Add a narrowly scoped unique partial index on
`(os_id, payload->>'payment_id')` for `PAYMENT_SUBMITTED`, following a
duplicate scan. Existing 19S/19T proof triggers must remain unchanged.

The review-only SQL prototype lives at
`docs/tasks/phase-19v-atomic-finalization-PROPOSAL.sql`.
It is deliberately **outside** `supabase/migrations` and MUST NOT be
copied into production or executed without additional approval and
backend review.

## Behavior to preserve

1. **No receipt**: a PENDING proof with empty metadata can be finalized.
2. **Receipt uploaded**: only a fully attached first R2 proof may be
   finalized; uploads continue outside the database transaction.
3. **Retries**: after a dropped RPC response, a repeat request to the
   same proof returns already submitted, without a second event.
4. **Concurrency**: two calls for the same proof, even from different
   browser tabs, serialize on the OS lock. Two different proofs for
   the same OS also serialize, without suppressing legitimate payments.
5. **Authorization**: anonymous, signed-out, non-module and non-owner
   users cannot finalize another user's proof. RLS and invoker grants
   apply during SELECT, UPDATE and INSERT.
6. **Server-controlled business status**:
   AGENDADO -> SCHEDULED; full payment with received date equal to
   São Paulo current date -> RELEASED; otherwise UNDER_REVIEW.
7. **Failure**: if event insertion fails, the status change rolls back;
   if R2 PUT succeeded but attachment metadata fails, manual
   reconciliation remains necessary — SQL transaction cannot roll back R2.

## Blocking issues before production implementation

- Check **all direct writers** of `os.payment_status` and
  `os_event(PAYMENT_SUBMITTED)`; any role with broad UPDATE/INSERT can
  bypass the new RPC. Consider narrow column/trigger enforcement
  without changing art/production status or general audit events.
- Verify index definition and grant preflight on current schema,
  migration ordering, existing duplicate/invalid event payloads,
  RLS behavior for SELECT FOR UPDATE, and `auth.uid()` spoof resistance.
- Verify exact status parity and timezone at date boundaries. The old
  browser rule uses client-local time; the proposed server rule uses
  São Paulo. Define acceptance for users outside São Paulo.
- Migration and frontend switchover must be **separate, authorized steps**.
  Never switch the frontend to an RPC that has not been deployed.
- Without sandbox, perform only offline/static tests and read-only
  production inspections. **Real transactional/RLS integration remains
  unverified**, and 19V cannot be marked functionally homologated.
- Audit cleanup/duplicate retry UX after browser refresh and multi-device
  access. Current 19U protection is only per mounted form instance.

## Review gates

1. This proposal PR may be reviewed but must **not** be merged as a
   production change without a new authorization.
2. A subsequent migration requires its **own authorization** and a
   fail-closed production preflight.
3. Any frontend/backend switch requires its **own authorization and merge**.
4. Verify CI + Vercel automatic Preview (no manual deploy).
5. Never write synthetic financial rows to production to prove behavior.

## Auditoria de acesso direto (revisão seguinte)

A revisão documentada em
[`phase-19v-direct-write-security-audit.md`](./phase-19v-direct-write-security-audit.md)
mostrou que `os_update` e `os_event_insert` continuam permitindo
modificações diretas por usuários do módulo, e `os_event_delete` permite
exclusão de eventos por gerente. Por isso a implantação foi dividida
em **19V-A (RPC aditiva)**, **19V-B (frontend passa a usar RPC)** e
**19V-C (restrição dos acessos diretos)**. É incorreto marcar
19V-C como atendida pela função `SECURITY INVOKER` proposta.

O protótipo SQL continua em `docs/tasks` e não pode ser aplicado sem
migração gerada via CLI, revisão e autorização separada. Nenhum passo
acima exige configurar sandbox ou fazer testes de escrita em produção.
