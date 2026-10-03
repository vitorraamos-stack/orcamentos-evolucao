import Decimal from "decimal.js";
import { CalculationEngineError } from "../errors";
import { decimalString, type DecimalString } from "./index";

export const ENGINE_DECIMAL_PRECISION = 50;
export const MAX_DECIMAL_TEXT_LENGTH = 1_024;
export const MAX_DECIMAL_PLACES = 500;
export const MAX_DECIMAL_MAGNITUDE = 1_000;
export const MAX_SERIALIZED_DECIMAL_LENGTH = 2_048;

// Kept module-private so application code cannot mutate the engine constructor.
const EngineDecimal = Decimal.clone({
  precision: ENGINE_DECIMAL_PRECISION,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -1_000_000_000,
  toExpPos: 1_000_000_000,
});

export type EngineDecimalValue = InstanceType<typeof EngineDecimal>;

function invalidDecimal(value: string, reason: string): CalculationEngineError {
  return new CalculationEngineError("INVALID_DECIMAL", reason, { value });
}

/** The sole runtime gateway into Decimal; binary floating-point inputs are impossible. */
export function decimalFrom(value: DecimalString): EngineDecimalValue {
  if (value.length > MAX_DECIMAL_TEXT_LENGTH) {
    throw invalidDecimal(value, "Decimal text exceeds the operational limit");
  }
  const fraction = value.includes(".")
    ? value.slice(value.indexOf(".") + 1)
    : "";
  if (fraction.length > MAX_DECIMAL_PLACES) {
    throw invalidDecimal(value, "Decimal places exceed the operational limit");
  }

  try {
    const result = new EngineDecimal(value);
    if (Math.abs(result.exponent()) > MAX_DECIMAL_MAGNITUDE) {
      throw invalidDecimal(
        value,
        "Decimal magnitude exceeds the operational limit"
      );
    }
    return result;
  } catch (error) {
    if (error instanceof CalculationEngineError) throw error;
    throw invalidDecimal(value, "Invalid decimal value");
  }
}

/** Canonical, non-exponential serialization; negative zero is normalized to zero. */
export function serializeDecimal(value: EngineDecimalValue): DecimalString {
  if (Math.abs(value.exponent()) > MAX_DECIMAL_MAGNITUDE) {
    throw invalidDecimal(
      value.toString(),
      "Result magnitude exceeds the operational limit"
    );
  }
  const serialized = value.isZero() ? "0" : value.toFixed();
  if (serialized.length > MAX_SERIALIZED_DECIMAL_LENGTH) {
    throw invalidDecimal(
      serialized,
      "Serialized result exceeds the operational limit"
    );
  }
  return decimalString(serialized);
}
