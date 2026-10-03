import {
  addDecimal,
  compareDecimal,
  decimalString,
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
  type DecimalString,
} from "../decimal";
import { CalculationEngineError } from "../errors";
import { UNIT_CATALOG, type UnitId, type UnitSemantic } from "./index";
import { convertUnit } from "./conversion";
import {
  addDimensionExponents,
  DIMENSIONS,
  dimensionsEqual,
  isScalarDimension,
  subtractDimensionExponents,
  type Dimension,
} from "./dimensions";

export type DimensionalSemantic = UnitSemantic | "scalar" | "derived";

export interface DimensionalDecimalValue {
  readonly kind: "decimal";
  readonly value: DecimalString;
  readonly dimension: Dimension;
  readonly unit: UnitId | null;
  readonly semantic: DimensionalSemantic;
}

export function resolveDecimalValue(
  value: DecimalString,
  unit: UnitId
): DimensionalDecimalValue {
  const definition = UNIT_CATALOG[unit];
  if (!definition) {
    throw new CalculationEngineError("UNKNOWN_UNIT", `Unknown unit: ${unit}`, {
      unit,
    });
  }
  return {
    kind: "decimal",
    value,
    unit,
    dimension: definition.dimension,
    semantic: definition.semantic,
  };
}

export function scalarValue(value: DecimalString): DimensionalDecimalValue {
  return {
    kind: "decimal",
    value,
    unit: null,
    dimension: DIMENSIONS.scalar,
    semantic: "scalar",
  };
}

function assertCompatible(
  left: DimensionalDecimalValue,
  right: DimensionalDecimalValue
): void {
  if (!dimensionsEqual(left.dimension, right.dimension)) {
    throw new CalculationEngineError(
      "INCOMPATIBLE_DIMENSIONS",
      "Values have incompatible physical dimensions",
      { leftDimension: left.dimension, rightDimension: right.dimension }
    );
  }
  if (left.semantic !== right.semantic) {
    throw new CalculationEngineError(
      "INCOMPATIBLE_UNIT_SEMANTICS",
      "Values have incompatible operational semantics",
      { leftSemantic: left.semantic, rightSemantic: right.semantic }
    );
  }
}

function normalize(value: DimensionalDecimalValue): DimensionalDecimalValue {
  if (value.unit === null) return value;
  const canonical = UNIT_CATALOG[value.unit].canonicalUnit;
  return {
    ...value,
    value: convertUnit(value.value, value.unit, canonical),
    unit: canonical,
  };
}

export function addDimensionalValues(
  left: DimensionalDecimalValue,
  right: DimensionalDecimalValue
): DimensionalDecimalValue {
  assertCompatible(left, right);
  const a = normalize(left);
  const b = normalize(right);
  return { ...a, value: addDecimal(a.value, b.value) };
}

export function subtractDimensionalValues(
  left: DimensionalDecimalValue,
  right: DimensionalDecimalValue
): DimensionalDecimalValue {
  assertCompatible(left, right);
  const a = normalize(left);
  const b = normalize(right);
  return { ...a, value: subtractDecimal(a.value, b.value) };
}

function canonicalPhysicalUnit(dimension: Dimension): UnitId | null {
  if (dimensionsEqual(dimension, DIMENSIONS.length)) return "m";
  if (dimensionsEqual(dimension, DIMENSIONS.area)) return "m2";
  if (dimensionsEqual(dimension, DIMENSIONS.mass)) return "kg";
  if (dimensionsEqual(dimension, DIMENSIONS.time)) return "h";
  if (dimensionsEqual(dimension, DIMENSIONS.currency)) return "BRL";
  return null;
}

function resultMetadata(
  dimension: Dimension,
  left: DimensionalDecimalValue,
  right: DimensionalDecimalValue
): Pick<DimensionalDecimalValue, "dimension" | "unit" | "semantic"> {
  if (isScalarDimension(dimension)) {
    return { dimension, unit: null, semantic: "scalar" };
  }
  const nonScalar = isScalarDimension(left.dimension) ? right : left;
  const otherIsScalar =
    isScalarDimension(left.dimension) || isScalarDimension(right.dimension);
  if (
    otherIsScalar &&
    dimensionsEqual(dimension, nonScalar.dimension) &&
    nonScalar.semantic !== "derived"
  ) {
    return { dimension, unit: nonScalar.unit, semantic: nonScalar.semantic };
  }
  const unit = canonicalPhysicalUnit(dimension);
  return {
    dimension,
    unit,
    semantic: unit ? UNIT_CATALOG[unit].semantic : "derived",
  };
}

export function multiplyDimensionalValues(
  left: DimensionalDecimalValue,
  right: DimensionalDecimalValue
): DimensionalDecimalValue {
  const a = normalize(left);
  const b = normalize(right);
  const dimension = addDimensionExponents(a.dimension, b.dimension);
  return {
    kind: "decimal",
    value: multiplyDecimal(a.value, b.value),
    ...resultMetadata(dimension, a, b),
  };
}

export function divideDimensionalValues(
  left: DimensionalDecimalValue,
  right: DimensionalDecimalValue
): DimensionalDecimalValue {
  // Performs the required zero check before dimensional result construction.
  if (compareDecimal(right.value, decimalString("0")) === 0) {
    divideDecimal(left.value, right.value);
  }
  const a = normalize(left);
  const b = normalize(right);
  const dimension = subtractDimensionExponents(a.dimension, b.dimension);
  return {
    kind: "decimal",
    value: divideDecimal(a.value, b.value),
    ...resultMetadata(dimension, a, b),
  };
}

export function compareDimensionalValues(
  left: DimensionalDecimalValue,
  right: DimensionalDecimalValue
): -1 | 0 | 1 {
  assertCompatible(left, right);
  const result = compareDecimal(normalize(left).value, normalize(right).value);
  return result < 0 ? -1 : result > 0 ? 1 : 0;
}
