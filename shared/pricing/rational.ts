import { CalculationEngineError } from "../calculation-engine/errors/index.js";
import {
  ENGINE_DECIMAL_PRECISION,
  MAX_SERIALIZED_DECIMAL_LENGTH,
  decimalFrom,
  decimalString,
  type DecimalString,
} from "../calculation-engine/decimal/index.js";
import { PricingDomainError } from "./errors.js";

export interface ExactRational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const MAX_RATIONAL_DIGITS = 4_096;
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_TWO = BigInt(2);
const BIGINT_TEN = BigInt(10);

function numericLimit(message: string): never {
  throw new PricingDomainError("PRICING_NUMERIC_LIMIT_EXCEEDED", message);
}

function bigintDigits(value: bigint): number {
  const absolute = value < BIGINT_ZERO ? -value : value;
  return absolute.toString().length;
}

function assertRationalLimit(value: ExactRational): ExactRational {
  if (
    bigintDigits(value.numerator) > MAX_RATIONAL_DIGITS ||
    bigintDigits(value.denominator) > MAX_RATIONAL_DIGITS
  )
    numericLimit("Pricing rational intermediate exceeds the technical limit");
  return value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < BIGINT_ZERO ? -left : left;
  let b = right < BIGINT_ZERO ? -right : right;
  while (b !== BIGINT_ZERO) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === BIGINT_ZERO ? BIGINT_ONE : a;
}

function normalize(numerator: bigint, denominator: bigint): ExactRational {
  if (denominator === BIGINT_ZERO)
    throw new PricingDomainError(
      "INVALID_PRICING_DENOMINATOR",
      "Pricing denominator must be greater than zero"
    );
  if (numerator === BIGINT_ZERO)
    return { numerator: BIGINT_ZERO, denominator: BIGINT_ONE };
  const sign = denominator < BIGINT_ZERO ? -BIGINT_ONE : BIGINT_ONE;
  const signedNumerator = numerator * sign;
  const positiveDenominator = denominator * sign;
  const divisor = gcd(signedNumerator, positiveDenominator);
  return assertRationalLimit({
    numerator: signedNumerator / divisor,
    denominator: positiveDenominator / divisor,
  });
}

function pow10(exponent: number): bigint {
  if (
    !Number.isInteger(exponent) ||
    exponent < 0 ||
    exponent > MAX_RATIONAL_DIGITS
  )
    numericLimit("Pricing decimal scale exceeds the technical limit");
  let result = BIGINT_ONE;
  let base = BIGINT_TEN;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result *= base;
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) base *= base;
  }
  return result;
}

export function rationalFromDecimal(value: DecimalString): ExactRational {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");
  const digits = `${integer}${fraction}`;
  const numerator = BigInt(digits) * (negative ? -BIGINT_ONE : BIGINT_ONE);
  return normalize(numerator, pow10(fraction.length));
}

export const rationalZero = (): ExactRational => ({
  numerator: BIGINT_ZERO,
  denominator: BIGINT_ONE,
});
export const rationalOne = (): ExactRational => ({
  numerator: BIGINT_ONE,
  denominator: BIGINT_ONE,
});

export function addRational(
  left: ExactRational,
  right: ExactRational
): ExactRational {
  return normalize(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function subtractRational(
  left: ExactRational,
  right: ExactRational
): ExactRational {
  return normalize(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function multiplyRational(
  left: ExactRational,
  right: ExactRational
): ExactRational {
  return normalize(
    left.numerator * right.numerator,
    left.denominator * right.denominator
  );
}

export function divideRational(
  left: ExactRational,
  right: ExactRational
): ExactRational {
  if (right.numerator === BIGINT_ZERO)
    throw new PricingDomainError(
      "INVALID_PRICING_DENOMINATOR",
      "Pricing denominator must be greater than zero"
    );
  return normalize(
    left.numerator * right.denominator,
    left.denominator * right.numerator
  );
}

export function compareRational(
  left: ExactRational,
  right: ExactRational
): number {
  const delta =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < BIGINT_ZERO ? -1 : delta > BIGINT_ZERO ? 1 : 0;
}

function decimalExponent(value: ExactRational): number {
  const numerator =
    value.numerator < BIGINT_ZERO ? -value.numerator : value.numerator;
  const denominator = value.denominator;
  let exponent = bigintDigits(numerator) - bigintDigits(denominator);
  if (exponent >= 0) {
    if (numerator < denominator * pow10(exponent)) exponent -= 1;
  } else if (numerator * pow10(-exponent) < denominator) exponent -= 1;
  return exponent;
}

function fixedFromScaledInteger(value: bigint, decimalPlaces: number): string {
  const digits = value.toString();
  if (decimalPlaces <= 0) return `${digits}${"0".repeat(-decimalPlaces)}`;
  const body =
    digits.length <= decimalPlaces
      ? `0.${"0".repeat(decimalPlaces - digits.length)}${digits}`
      : `${digits.slice(0, -decimalPlaces)}.${digits.slice(-decimalPlaces)}`;
  return body.includes(".") ? body.replace(/0+$/, "").replace(/\.$/, "") : body;
}

/** 50 significant digits, half-even, fixed notation. This is computational serialization only. */
export function serializeRational(value: ExactRational): DecimalString {
  if (value.numerator === BIGINT_ZERO) return decimalString("0");
  const negative = value.numerator < BIGINT_ZERO;
  const absolute = normalize(
    negative ? -value.numerator : value.numerator,
    value.denominator
  );
  const exponent = decimalExponent(absolute);
  const decimalPlaces = ENGINE_DECIMAL_PRECISION - 1 - exponent;
  let scaledNumerator = absolute.numerator;
  let scaledDenominator = absolute.denominator;
  if (decimalPlaces >= 0) scaledNumerator *= pow10(decimalPlaces);
  else scaledDenominator *= pow10(-decimalPlaces);

  let quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  const twiceRemainder = remainder * BIGINT_TWO;
  if (
    twiceRemainder > scaledDenominator ||
    (twiceRemainder === scaledDenominator &&
      quotient % BIGINT_TWO !== BIGINT_ZERO)
  )
    quotient += BIGINT_ONE;

  const unsigned = fixedFromScaledInteger(quotient, decimalPlaces);
  const serialized = `${negative ? "-" : ""}${unsigned}`;
  if (serialized.length > MAX_SERIALIZED_DECIMAL_LENGTH)
    numericLimit("Pricing result exceeds the serialized decimal limit");

  try {
    const branded = decimalString(serialized);
    decimalFrom(branded);
    return branded;
  } catch (error) {
    if (error instanceof CalculationEngineError)
      numericLimit("Pricing result cannot be represented by the decimal gateway");
    throw error;
  }
}
