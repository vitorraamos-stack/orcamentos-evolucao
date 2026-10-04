import { divideDecimal, multiplyDecimal, type DecimalString } from "../decimal/index.js";
import { CalculationEngineError } from "../errors/index.js";
import { getUniversalConversion, UNIT_CATALOG, type UnitId } from "./index.js";
import { dimensionsEqual } from "./dimensions.js";

export function convertUnit(
  value: DecimalString,
  from: UnitId,
  to: UnitId
): DecimalString {
  if (from === to) return value;
  const source = UNIT_CATALOG[from];
  const target = UNIT_CATALOG[to];
  if (!dimensionsEqual(source.dimension, target.dimension)) {
    throw new CalculationEngineError(
      "INCOMPATIBLE_DIMENSIONS",
      `Cannot convert ${from} to ${to}`,
      { from, to }
    );
  }
  if (
    source.semantic !== target.semantic ||
    source.canonicalUnit !== target.canonicalUnit
  ) {
    throw new CalculationEngineError(
      "INCOMPATIBLE_UNIT_SEMANTICS",
      `Units ${from} and ${to} have different operational semantics`,
      { from, to }
    );
  }

  const direct = getUniversalConversion(from, to);
  if (direct) {
    return divideDecimal(
      multiplyDecimal(value, direct.numerator),
      direct.denominator
    );
  }
  const inverse = getUniversalConversion(to, from);
  if (inverse) {
    return divideDecimal(
      multiplyDecimal(value, inverse.denominator),
      inverse.numerator
    );
  }

  // Any compatible non-canonical pair can safely travel through the canonical unit.
  if (from !== source.canonicalUnit && to !== target.canonicalUnit) {
    return convertUnit(
      convertUnit(value, from, source.canonicalUnit),
      source.canonicalUnit,
      to
    );
  }
  throw new CalculationEngineError(
    "UNKNOWN_UNIT",
    `No conversion from ${from} to ${to}`
  );
}

export function normalizeUnit(
  value: DecimalString,
  unit: UnitId
): DecimalString {
  return convertUnit(value, unit, UNIT_CATALOG[unit].canonicalUnit);
}
