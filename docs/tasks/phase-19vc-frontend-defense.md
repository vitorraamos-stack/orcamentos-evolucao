# 19V-C — Frontend defense-in-depth

The public legacy Hub OS API no longer exposes an unused direct-payment
writer (`updateOsPaymentStatus`). Generic `updateOs` uses a type that
excludes `payment_status`, `quote_total`, and `quote_id`, plus a
runtime own-property check that blocks those fields before any network
request, including callers bypassing TypeScript types.

**This is not a substitute for 19V-C database restrictions.** A user
can bypass application code and call the Supabase Data API directly
while the current table-level grants remain. The server must still
enforce the transactional rule in a separately approved migration.

The rest of the `updateOs` implementation is unchanged. The existing
`finalizeLegacyPaymentSubmission` RPC remains the only payment
finalization flow used by `OsDetailPage`. Arte, Produção, Kanban and
regular OS edit functionality continue using `updateOs` for their
operational fields. UI or runtime authenticated financial tests are
not claimed by the static contract tests below.
