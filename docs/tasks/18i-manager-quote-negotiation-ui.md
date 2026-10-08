# 18I — Manager Quote negotiation UI

Status: **implementation prepared for review**.

## Goal

Allow a manager to authorize a final Quote price while keeping the official calculation immutable and the protected commercial floor private.

## Public contract

SAVE_QUOTE accepts an optional negotiation request:
- OFFICIAL;
- MANAGER_FINAL_PRICE with final amount, reason and explicit below-minimum override flag.

SAVE_QUOTE and GET_QUOTE return only:
- pricingMode = OFFICIAL | MANAGER_ADJUSTED;
- authorized totalSellingPrice.

They never return:
- minimumAllowedTotal;
- adjustment reason;
- below-minimum flag;
- override evidence;
- costing/markup/financial rate.

## Authorization

Frontend visibility uses the existing AuthContext manager role only for UX.

Server authority remains definitive:
- consultants cannot persist MANAGER_FINAL_PRICE;
- QuoteNegotiationService rejects it before RPC;
- the v3 SQL validator also enforces manager authority.

## Below-minimum flow

The UI does not know the floor.

1. manager enters final price + reason;
2. save is attempted without override;
3. if server returns BELOW_MINIMUM_OVERRIDE_REQUIRED, an explicit confirmation dialog appears;
4. only after confirmation does the UI retry with allowBelowMinimum=true;
5. SQL persists the private audit evidence.

## Existing adjusted Quotes

A consultant may view/use an already-authorized adjusted Quote but cannot edit its DRAFT inputs. A manager must make changes so an approved price is not silently replaced.

## Proposal

The proposal continues to show public technical line items from the official snapshot, but its final total uses the sanitized authorized negotiation total.

## Persistence

No migration is required in 18I. The existing 18G v3 schema/RPCs remain the source of truth.
