# 19V-B — Client switchover to atomic legacy payment finalization

**Scope:** The only changed runtime path is the legacy payment submission
in `src/modules/hub-os/pages/OsDetailPage.tsx`. The PostgreSQL RPC
`public.finalize_legacy_payment_submission(uuid)` was installed through
the approved 19V-A migration `20261015134750` and is already in production.

## Runtime behavior

1. Validate the payment form and optional proof file locally before writing.
2. Create the proof row under the current authenticated identity.
3. If a file exists, request a presigned R2 URL, upload, and persist the
   attachment metadata once, maintaining the 19S/19T immutability rules.
4. Call `finalizeLegacyPaymentSubmission(proof.id)` exactly once, which
   invokes the existing database `finalize_legacy_payment_submission` RPC.
   It computes status server-side and atomically updates `os` plus
   appends `PAYMENT_SUBMITTED` in one database transaction.
5. Validate response `payment_id`, both allowed status values and the
   `already_submitted` boolean. Respect `current_os_payment_status`
   (it may differ from this proof's status after another payment).
6. Once the RPC confirms success, reset only the payment form. Reload
   `os`, `os_event` and `os_payment_proof` to render saved truth.
   If refresh fails or the expected own submission is not found, warn
   that the operation may already be committed and block another attempt
   until the OS can be reviewed/reopened.
7. If the RPC call rejects/times out or the response cannot be validated,
   attempt **read-only reconciliation** for the same proof ID and actor
   by loading the existing event, OS and payment list. If proof and event
   are verified, show success; otherwise stop and require manual review.
   Never retry the upload or create a second proof automatically.

## Explicit constraints

- Existing single-flight submission and R2 ambiguity safeguards remain.
- No new SQL, migrations, auth/admin privileges, backend API endpoints,
  or privileged keys are created in this PR.
- Client-side reconciliation does not assure cross-device idempotence:
  reopening a form may create a **new proof ID** for the same payment.
  The index only deduplicates submissions per proof ID.
- This stage does **not** remove direct `os.payment_status` updates or
  `os_event` writes permitted to authenticated clients. The server-side
  restrictions remain separately gated phase 19V-C.
- The status-day definition becomes the database's
  `America/Sao_Paulo` calendar rather than browser-local time.
- R2 upload remains non-transactional relative to Postgres.
- Unit tests and CI are synthetic/static and do not prove authenticated
  RLS, R2 integrity, transaction rollback or concurrency. Owner declined
  sandbox; do not test by writing real customer payment records.

**Approval gates:** PR review + green CI + Vercel Preview READY;
merge is separate explicit permission. No migration or manual deploy.
