# 18H — Quote runtime v3 activation

Status: **backend runtime prepared for review; no UI negotiation yet**.

## Goal

Move new Quote snapshot persistence from the legacy v2 RPCs to the 18G v3 RPCs without changing the current Sales experience.

## Runtime behavior

For every SAVE_QUOTE request in this stage:

1. the server recalculates the official Quote from source-of-truth product/pricing/costing data;
2. the server evaluates negotiation internally as `{ mode: "OFFICIAL" }`;
3. the server derives the protected Quote minimum from product minimum + installation + munck + financial rate;
4. the server persists:
   - official total;
   - protected minimum total;
   - final total;
   - private negotiation evidence;
5. the browser still receives the same public Quote DTO as before.

No browser field can supply a manual final price in 18H.

## RPC switch

New snapshots use:
- `quote_create_with_snapshot_v3_secure`;
- `quote_append_snapshot_v3_secure`.

Existing read/list/transition RPCs remain unchanged.

The v2 RPCs remain in the database for compatibility/rollback but are no longer referenced by the server runtime after this stage.

## Privacy boundary

The following remain server/database-only:
- protected minimum;
- private negotiation evidence;
- pricing cost;
- markup;
- financial rate;
- manager reason/override evidence.

The public Quote save/load/list contracts remain unchanged in this stage.

## Compatibility

- Existing legacy/v2 snapshots remain readable.
- New OFFICIAL snapshots have final total equal to official total.
- Quote lifecycle rules and optimistic locking remain unchanged.
- Consultants can continue creating and editing their own DRAFT Quotes.
- Managers retain cross-owner access as before.

## Next stage

18I introduces the manager-facing negotiation request and UI. That stage may expose only the sanitized public negotiation projection (`pricingMode` and authorized final total), never the protected minimum or private reason/override snapshot.
