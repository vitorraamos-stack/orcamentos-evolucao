import type { TechnicalInputValue } from "@shared/calculation-engine/contracts";
import {
  decimalFrom,
  decimalString,
  type DecimalString,
} from "@shared/calculation-engine/decimal";
import {
  convertUnit,
  type UnitId,
} from "@shared/calculation-engine/units";
import type { ProductInput } from "@shared/product-engineering";

export type QuoteFieldValues = Record<string, string | boolean>;
export type QuoteFieldUnits = Record<string, UnitId | null>;

const lengthUnits = new Set<UnitId>(["mm", "cm", "m"]);

export const isDimensionField = (input: ProductInput) =>
  input.type === "DECIMAL" &&
  input.unit !== null &&
  lengthUnits.has(input.unit) &&
  (input.key === "width" || input.key === "height");

export function normalizeUserDecimal(value: string): DecimalString {
  const trimmed = value.trim().replace(/\s+/g, "");
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = decimalString(normalized);
  return decimalString(decimalFrom(parsed).toFixed());
}

export function positiveUserDecimal(value: string, label: string): DecimalString {
  const normalized = normalizeUserDecimal(value);
  if (!decimalFrom(normalized).greaterThan(0))
    throw new Error(`${label} deve ser maior que zero.`);
  return normalized;
}

export function initialQuoteFields(inputs: readonly ProductInput[]): {
  values: QuoteFieldValues;
  units: QuoteFieldUnits;
} {
  const values: QuoteFieldValues = {};
  const units: QuoteFieldUnits = {};

  for (const input of inputs) {
    if (input.type === "DECIMAL") {
      const unit =
        isDimensionField(input) && input.unit === "m" ? "cm" : input.unit;
      units[input.key] = unit;
      if (input.defaultValue !== undefined) {
        values[input.key] =
          input.unit !== null && unit !== null && input.unit !== unit
            ? convertUnit(input.defaultValue, input.unit, unit)
            : input.defaultValue;
      } else {
        values[input.key] = "";
      }
    } else if (input.type === "BOOLEAN") {
      values[input.key] = input.defaultValue ?? false;
    } else {
      values[input.key] = input.defaultValue ?? "";
    }
  }
  return { values, units };
}

export function buildTechnicalInputs(
  inputs: readonly ProductInput[],
  values: QuoteFieldValues,
  units: QuoteFieldUnits
): Record<string, TechnicalInputValue> {
  const result: Record<string, TechnicalInputValue> = {};

  for (const input of inputs) {
    const raw = values[input.key];

    if (input.type === "BOOLEAN") {
      result[input.key] = { kind: "boolean", value: raw === true };
      continue;
    }

    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) {
      if (input.required) throw new Error(`Preencha ${input.label}.`);
      continue;
    }

    if (input.type === "DECIMAL") {
      result[input.key] = {
        kind: "decimal",
        value: normalizeUserDecimal(text),
        unit: units[input.key] ?? input.unit,
      };
      continue;
    }

    result[input.key] = { kind: "string", value: text };
  }

  return result;
}
