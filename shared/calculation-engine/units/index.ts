import type { DecimalString } from "../decimal";
import { decimalString } from "../decimal";
import { DIMENSIONS, type Dimension } from "./dimensions";

export const UNIT_IDS = [
  "mm",
  "cm",
  "m",
  "m2",
  "linear_m",
  "un",
  "sheet",
  "g",
  "kg",
  "min",
  "h",
  "BRL",
] as const;

export type UnitId = (typeof UNIT_IDS)[number];
export type UnitSemantic =
  | "physical"
  | "linear_commercial"
  | "unit_count"
  | "sheet_count"
  | "currency";

export interface UnitDefinition {
  readonly id: UnitId;
  readonly label: string;
  readonly symbol: string;
  readonly dimension: Dimension;
  readonly canonicalUnit: UnitId;
  /** Prevents physical compatibility from implying operational interchangeability. */
  readonly semantic: UnitSemantic;
}

export const UNIT_CATALOG = {
  mm: {
    id: "mm",
    label: "Milímetro",
    symbol: "mm",
    dimension: DIMENSIONS.length,
    canonicalUnit: "m",
    semantic: "physical",
  },
  cm: {
    id: "cm",
    label: "Centímetro",
    symbol: "cm",
    dimension: DIMENSIONS.length,
    canonicalUnit: "m",
    semantic: "physical",
  },
  m: {
    id: "m",
    label: "Metro",
    symbol: "m",
    dimension: DIMENSIONS.length,
    canonicalUnit: "m",
    semantic: "physical",
  },
  m2: {
    id: "m2",
    label: "Metro quadrado",
    symbol: "m²",
    dimension: DIMENSIONS.area,
    canonicalUnit: "m2",
    semantic: "physical",
  },
  linear_m: {
    id: "linear_m",
    label: "Metro linear (ml)",
    symbol: "ml",
    dimension: DIMENSIONS.length,
    canonicalUnit: "linear_m",
    semantic: "linear_commercial",
  },
  un: {
    id: "un",
    label: "Unidade",
    symbol: "un",
    dimension: DIMENSIONS.count,
    canonicalUnit: "un",
    semantic: "unit_count",
  },
  sheet: {
    id: "sheet",
    label: "Chapa",
    symbol: "chapa",
    dimension: DIMENSIONS.count,
    canonicalUnit: "sheet",
    semantic: "sheet_count",
  },
  g: {
    id: "g",
    label: "Grama",
    symbol: "g",
    dimension: DIMENSIONS.mass,
    canonicalUnit: "kg",
    semantic: "physical",
  },
  kg: {
    id: "kg",
    label: "Quilograma",
    symbol: "kg",
    dimension: DIMENSIONS.mass,
    canonicalUnit: "kg",
    semantic: "physical",
  },
  min: {
    id: "min",
    label: "Minuto",
    symbol: "min",
    dimension: DIMENSIONS.time,
    canonicalUnit: "h",
    semantic: "physical",
  },
  h: {
    id: "h",
    label: "Hora",
    symbol: "h",
    dimension: DIMENSIONS.time,
    canonicalUnit: "h",
    semantic: "physical",
  },
  BRL: {
    id: "BRL",
    label: "Real brasileiro",
    symbol: "R$",
    dimension: DIMENSIONS.currency,
    canonicalUnit: "BRL",
    semantic: "currency",
  },
} as const satisfies Record<UnitId, UnitDefinition>;

export interface UniversalConversion {
  readonly from: UnitId;
  readonly to: UnitId;
  /** Exact rational scale; arithmetic belongs to a future Decimal-based engine. */
  readonly numerator: DecimalString;
  readonly denominator: DecimalString;
}

export const UNIVERSAL_CONVERSIONS = [
  {
    from: "mm",
    to: "m",
    numerator: decimalString("1"),
    denominator: decimalString("1000"),
  },
  {
    from: "cm",
    to: "m",
    numerator: decimalString("1"),
    denominator: decimalString("100"),
  },
  {
    from: "g",
    to: "kg",
    numerator: decimalString("1"),
    denominator: decimalString("1000"),
  },
  {
    from: "min",
    to: "h",
    numerator: decimalString("1"),
    denominator: decimalString("60"),
  },
] as const satisfies readonly UniversalConversion[];

export function getUniversalConversion(
  from: UnitId,
  to: UnitId
): UniversalConversion | undefined {
  return UNIVERSAL_CONVERSIONS.find(
    conversion => conversion.from === from && conversion.to === to
  );
}
