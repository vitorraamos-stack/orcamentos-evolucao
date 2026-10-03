import type { DecimalString } from "./index";
import { CalculationEngineError } from "../errors";
import { decimalFrom, serializeDecimal } from "./engineDecimal";

export const addDecimal = (left: DecimalString, right: DecimalString) =>
  serializeDecimal(decimalFrom(left).plus(decimalFrom(right)));
export const subtractDecimal = (left: DecimalString, right: DecimalString) =>
  serializeDecimal(decimalFrom(left).minus(decimalFrom(right)));
export const multiplyDecimal = (left: DecimalString, right: DecimalString) =>
  serializeDecimal(decimalFrom(left).times(decimalFrom(right)));

export function divideDecimal(
  left: DecimalString,
  right: DecimalString
): DecimalString {
  const divisor = decimalFrom(right);
  if (divisor.isZero()) {
    throw new CalculationEngineError(
      "DIVISION_BY_ZERO",
      "Division by zero is undefined"
    );
  }
  return serializeDecimal(decimalFrom(left).dividedBy(divisor));
}

export const compareDecimal = (left: DecimalString, right: DecimalString) =>
  decimalFrom(left).comparedTo(decimalFrom(right));
export const absDecimal = (value: DecimalString) =>
  serializeDecimal(decimalFrom(value).absoluteValue());
export const minDecimal = (left: DecimalString, right: DecimalString) =>
  compareDecimal(left, right) <= 0 ? left : right;
export const maxDecimal = (left: DecimalString, right: DecimalString) =>
  compareDecimal(left, right) >= 0 ? left : right;
export const negateDecimal = (value: DecimalString) =>
  serializeDecimal(decimalFrom(value).negated());
export const roundDecimal = (value: DecimalString, decimalPlaces: number) =>
  serializeDecimal(decimalFrom(value).toDecimalPlaces(decimalPlaces));
export const ceilDecimal = (value: DecimalString) =>
  serializeDecimal(decimalFrom(value).ceil());
export const floorDecimal = (value: DecimalString) =>
  serializeDecimal(decimalFrom(value).floor());
