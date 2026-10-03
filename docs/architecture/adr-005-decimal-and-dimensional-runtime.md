# ADR 005 — Decimal and dimensional runtime

## Status

Accepted for Calculation Contract 1.1.0.

## Decimal runtime

The Calculation Engine uses the direct, exact dependency `decimal.js@10.6.0` through a
module-private `Decimal.clone`. Its computational precision is 50 significant digits and
its internal rounding mode is half-even. That rounding is solely the deterministic behavior
needed when an operation exceeds computational precision; it is **not** a commercial money
or pricing policy. Commercial rounding remains the responsibility of a future Pricing Engine.

Only branded `DecimalString` values can enter arithmetic. Calculable values never pass through
JavaScript `number`, `Number`, `parseFloat`, or implicit numeric coercion. Public results are
canonical strings produced with fixed notation, including normalization of negative zero to
`0`; exponent notation is never emitted.

Operational safeguards allow at most 1,024 input characters, 500 decimal places, an absolute
base-10 exponent of 1,000, and 2,048 serialized result characters. These limits are deliberately
well above business values while bounding pathological memory use. The lexical contract remains
separate and intentionally narrower (plain decimal notation only).

## Dimensional runtime

External technical decimal inputs contain only `value` and `unit`; their physical dimension and
operational semantic are derived from `UNIT_CATALOG`. Version 1.1.0 makes nested input objects
strict, so a caller cannot forge a dimension.

Physical dimension and operational semantic are independent. Universal physical conversions
(`mm/cm/m`, `g/kg`, and `min/h`) are exact and bidirectional. Contextual conversions remain
forbidden: `m` is not implicitly `linear_m`, `un` is not `sheet`, and a sheet is not an area.

Multiplication adds dimension exponents and division subtracts them. Known physical results map
to canonical units (for example, length² to `m2`); unknown derived dimensions retain their vector
with a null unit so a future DSL can validate them statically. Addition, subtraction, and comparison
require both physical dimensions and operational semantics to match and normalize compatible units
before arithmetic.
