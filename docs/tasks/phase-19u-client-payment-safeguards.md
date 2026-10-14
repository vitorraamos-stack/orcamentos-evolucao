# EvoluSystem — 19U: defensive client validation without a sandbox

The owner declined a sandbox. This pull request introduces a narrow UI mitigation and
**only synthetic/unit tests**. It does not homologate actual financial behavior or
authorize real uploads, Supabase production data writes, R2 changes, migrations or merge.

## Existing flow

PENDING proof → optional R2 presign/PUT → metadata UPDATE → OS payment status UPDATE →
`PAYMENT_SUBMITTED` event INSERT. This sequence is not atomic across services.

## Changes

- Validate optional receipt file before INSERT: non-empty, allowed MIME and at most 500MB.
- Block concurrent submissions with a synchronous ref, in addition to disabled button.
- Track ambiguous remote stages. After a PUT has started, never automatically DELETE the
  PENDING proof: a rejected/timeout response does not guarantee the object is absent.
- Retain owner-only 19S rollback for a known unattached proof when presign fails before PUT.
- If writes may be partial or cleanup fails, show persistent in-page warning and disable
  resubmission until a person checks the OS, receipt and events.
- Unit tests exercise recovery decisions and static integration markers without network.

## Remaining risks and limits

- Per-page ref is not a database idempotency guarantee across reloads/devices.
- OS status and PAYMENT_SUBMITTED event are still two separate writes; the client warning
  detects uncertainty but cannot make them transactional.
- Uploaded orphan objects are NOT deleted by this change.
- Real RLS/JWT, R2 PUT, SMB integration and browser E2E have not been tested.
- Backend reconciliation/transactional RPC is a separate stage, requiring a new
  migration authorization and a distinct merge authorization.
- The earlier Draft PR #482 describes the unapproved sandbox path and remains separate.

**No Supabase DDL/DML, no migrations, no manual Vercel deploy, no merge in this step.**
