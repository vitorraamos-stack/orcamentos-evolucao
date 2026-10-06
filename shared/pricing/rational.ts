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

function numericLimit(message: string): never {
  throw new PricingDomainError("PRICING_NUMERIC_LIMIT_EXCEEDED", message);
}

function bigintDigits(value: bigint): number {
  const absolute = value < 0n ? -value : value;
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
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function normalize(numerator: bigint, denominator: bigint): ExactRational {
  if (denominator === 0n)
    throw new PricingDomainError(
      "INVALID_PRICING_DENOMINATOR",
      "Pricing denominator must be greater than zero"
    );
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const sign = denominator < 0n ? -1n : 1n;
  const signedNumerator = numerator * sign;
  const positiveDenominator = denominator * sign;
  const divisor = gcd(signedNumerator, positiveDenominator);
  return assertRationalLimit({
    numerator: signedNumerator / divisor,
    denominator: positiveDenominator / divisor,
  });
}

function pow10(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_RATIONAL_DIGITS)
    numericLimit("Pricing decimal scale exceeds the technical limit");
  return 10n ** BigInt(exponent);
}

export function rationalFromDecimal(value: DecimalString): ExactRational {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");
  const digits = `${integer}${fraction}`;
  const numerator = BigInt(digits) * (negative ? -1n : 1n);
  return normalize(numerator, pow10(fraction.length));
}

export const rationalZero = (): ExactRational => ({
  numerator: 0n,
  denominator: 1n,
});
export const rationalOne = (): ExactRational => ({
  numerator: 1n,
  denominator: 1n,
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
  if (right.numerator === 0n)
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
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function decimalExponent(value: ExactRational): number {
  const numerator = value.numerator < 0n ? -value.numerator : value.numerator;
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
  if (value.numerator === 0n) return decimalString("0");
  const negative = value.numerator < 0n;
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
  const twiceRemainder = remainder * 2n;
  if (
    twiceRemainder > scaledDenominator ||
    (twiceRemainder === scaledDenominator && quotient % 2n !== 0n)
  )
    quotient += 1n;

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
