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

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  return value;
};

export const quoteFingerprint = (value: unknown) =>
  JSON.stringify(canonicalize(value));

export type QuoteEditableStateFingerprintInput = {
  productVersionId: string;
  fieldValues: QuoteFieldValues;
  fieldUnits: QuoteFieldUnits;
  quantity: string;
  installments: string;
  installationRequested: boolean;
  munckRequested: boolean;
  munckHours: string;
  commercial: {
    customerName: string;
    customerPhone: string | null;
    title: string;
  };
};

export const quoteEditableStateFingerprint = (
  input: QuoteEditableStateFingerprintInput
) =>
  quoteFingerprint({
    productVersionId: input.productVersionId,
    fieldValues: Object.fromEntries(
      Object.entries(input.fieldValues).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ])
    ),
    fieldUnits: input.fieldUnits,
    quantity: input.quantity.trim(),
    installments: input.installments,
    installationRequested: input.installationRequested,
    munckRequested: input.munckRequested,
    munckHours: input.munckRequested ? input.munckHours.trim() : null,
    commercial: {
      customerName: input.commercial.customerName.trim(),
      customerPhone: input.commercial.customerPhone?.trim() || null,
      title: input.commercial.title.trim(),
    },
  });

export function hydrateQuoteFields(
  inputs: readonly ProductInput[],
  technicalInputs: Record<string, TechnicalInputValue>
): {
  values: QuoteFieldValues;
  units: QuoteFieldUnits;
} {
  const hydrated = initialQuoteFields(inputs);

  for (const input of inputs) {
    const value = technicalInputs[input.key];
    if (!value) continue;

    if (input.type === "BOOLEAN" && value.kind === "boolean") {
      hydrated.values[input.key] = value.value;
      continue;
    }

    if (input.type === "DECIMAL" && value.kind === "decimal") {
      hydrated.values[input.key] = value.value;
      hydrated.units[input.key] = value.unit;
      continue;
    }

    if (
      (input.type === "TEXT" || input.type === "SELECT") &&
      value.kind === "string"
    ) {
      hydrated.values[input.key] = value.value;
    }
  }

  return hydrated;
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
