import type { TechnicalInputValue } from "../calculation-engine/contracts/index.js";
import { compareDecimal } from "../calculation-engine/decimal/index.js";
import type { ExpressionValue } from "../calculation-engine/expressions/index.js";
import {
  convertUnit,
  resolveDecimalValue,
  scalarValue,
} from "../calculation-engine/units/index.js";
import type { ProductInput } from "../product-engineering/index.js";
import { CostingDomainError } from "./errors.js";
import type { ResolvedInput } from "./aggregationContracts.js";

const fail = (
  code: "INVALID_TECHNICAL_INPUT" | "TECHNICAL_INPUT_OUT_OF_RANGE",
  key: string
): never => {
  throw new CostingDomainError(code, `${code}: ${key}`, { key });
};

function normalize(
  input: ProductInput,
  supplied: TechnicalInputValue
): { snapshot: TechnicalInputValue; expression: ExpressionValue } {
  if (input.type === "DECIMAL") {
    if (supplied.kind !== "decimal")
      return fail("INVALID_TECHNICAL_INPUT", input.key);
    let value = supplied.value;
    if (input.unit === null) {
      if (supplied.unit !== null)
        return fail("INVALID_TECHNICAL_INPUT", input.key);
    } else {
      if (supplied.unit === null)
        return fail("INVALID_TECHNICAL_INPUT", input.key);
      try {
        value = convertUnit(value, supplied.unit, input.unit);
      } catch {
        return fail("INVALID_TECHNICAL_INPUT", input.key);
      }
    }
    if (
      (input.min !== undefined && compareDecimal(value, input.min) < 0) ||
      (input.max !== undefined && compareDecimal(value, input.max) > 0)
    )
      return fail("TECHNICAL_INPUT_OUT_OF_RANGE", input.key);
    const snapshot = { kind: "decimal" as const, value, unit: input.unit };
    return {
      snapshot,
      expression:
        input.unit === null
          ? scalarValue(value)
          : resolveDecimalValue(value, input.unit),
    };
  }
  if (input.type === "BOOLEAN") {
    if (supplied.kind !== "boolean")
      return fail("INVALID_TECHNICAL_INPUT", input.key);
    return { snapshot: supplied, expression: supplied };
  }
  if (supplied.kind !== "string")
    return fail("INVALID_TECHNICAL_INPUT", input.key);
  if (
    input.type === "SELECT" &&
    !input.options.some(option => option.value === supplied.value)
  )
    return fail("INVALID_TECHNICAL_INPUT", input.key);
  if (
    input.type === "TEXT" &&
    input.maxLength !== undefined &&
    supplied.value.length > input.maxLength
  )
    return fail("INVALID_TECHNICAL_INPUT", input.key);
  return { snapshot: supplied, expression: supplied };
}

export function resolveTechnicalInputs(
  inputs: readonly ProductInput[],
  provided: Readonly<Record<string, TechnicalInputValue>>
): {
  resolvedInputs: readonly ResolvedInput[];
  values: Readonly<Record<string, ExpressionValue>>;
  missingOptional: ReadonlySet<string>;
} {
  const definitions = new Map(inputs.map(input => [input.key, input]));
  for (const key of Object.keys(provided))
    if (!definitions.has(key))
      throw new CostingDomainError(
        "UNKNOWN_TECHNICAL_INPUT",
        `Unknown technical input: ${key}`,
        { key }
      );
  const resolvedInputs: ResolvedInput[] = [],
    values: Record<string, ExpressionValue> = {},
    missingOptional = new Set<string>();
  for (const input of [...inputs].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)
  )) {
    let raw = provided[input.key],
      source: ResolvedInput["source"] = "PROVIDED";
    if (raw === undefined && input.defaultValue !== undefined) {
      source = "DEFAULT";
      raw =
        input.type === "DECIMAL"
          ? { kind: "decimal", value: input.defaultValue, unit: input.unit }
          : input.type === "BOOLEAN"
            ? { kind: "boolean", value: input.defaultValue }
            : { kind: "string", value: input.defaultValue };
    }
    if (raw === undefined) {
      if (input.required)
        throw new CostingDomainError(
          "MISSING_TECHNICAL_INPUT",
          `Missing technical input: ${input.key}`,
          { key: input.key }
        );
      missingOptional.add(input.key);
      continue;
    }
    const result = normalize(input, raw);
    values[input.key] = result.expression;
    resolvedInputs.push({ key: input.key, value: result.snapshot, source });
  }
  return { resolvedInputs, values, missingOptional };
}
