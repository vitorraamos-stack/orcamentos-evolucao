import { z } from "zod";
import { CalculationEngineError } from "../calculation-engine/errors";
import {
  inferExpressionType,
  topologicallySortVariables,
  type InferredType,
  type SymbolDefinition,
  type SymbolTable,
} from "../calculation-engine/expressions";
import { UNIT_CATALOG } from "../calculation-engine/units";
import {
  DIMENSIONS,
  dimensionsEqual,
} from "../calculation-engine/units/dimensions";
import type { ProductInput } from "./inputs";
import { productInputSchema } from "./inputs";
import { productComponentSchema } from "./components";
import { productVersionSchema } from "./productVersion";
import { productVariableSchema } from "./variables";

export const PRODUCT_ENGINEERING_SCHEMA_VERSION = "1.0" as const;
export const productVersionDefinitionSchema = z
  .object({
    schemaVersion: z.literal(PRODUCT_ENGINEERING_SCHEMA_VERSION),
    version: productVersionSchema,
    inputs: z.array(productInputSchema),
    variables: z.array(productVariableSchema),
    components: z.array(productComponentSchema),
  })
  .strict()
  .superRefine((definition, context) => {
    const reportDuplicateIds = (
      collection: readonly { readonly id: string }[],
      path: "inputs" | "variables" | "components"
    ): void => {
      const ids = new Set<string>();
      collection.forEach((item, index) => {
        if (ids.has(item.id))
          context.addIssue({
            code: "custom",
            path: [path, index, "id"],
            message: `DUPLICATE_${path.slice(0, -1).toUpperCase()}_ID: ${item.id}`,
          });
        ids.add(item.id);
      });
    };
    reportDuplicateIds(definition.inputs, "inputs");
    reportDuplicateIds(definition.variables, "variables");
    reportDuplicateIds(definition.components, "components");
    const inputKeys = new Set<string>();
    definition.inputs.forEach((input, index) => {
      if (inputKeys.has(input.key))
        context.addIssue({
          code: "custom",
          path: ["inputs", index, "key"],
          message: `DUPLICATE_INPUT_KEY: ${input.key}`,
        });
      inputKeys.add(input.key);
    });
    const variableKeys = new Set<string>();
    definition.variables.forEach((variable, index) => {
      if (variableKeys.has(variable.key))
        context.addIssue({
          code: "custom",
          path: ["variables", index, "key"],
          message: `DUPLICATE_VARIABLE_KEY: ${variable.key}`,
        });
      if (inputKeys.has(variable.key))
        context.addIssue({
          code: "custom",
          path: ["variables", index, "key"],
          message: `SYMBOL_KEY_COLLISION: ${variable.key}`,
        });
      variableKeys.add(variable.key);
    });
  });
export type ProductVersionDefinition = z.infer<
  typeof productVersionDefinitionSchema
>;

export interface EngineeringValidationIssue {
  readonly code: string;
  readonly path?: string;
  readonly message: string;
  readonly severity: "ERROR" | "WARNING";
}
interface ValidationResultBase {
  readonly issues: readonly EngineeringValidationIssue[];
}
export interface DraftValidationResult extends ValidationResultBase {
  readonly kind: "DRAFT";
  readonly persistable: boolean;
}
export interface PublicationValidationResult extends ValidationResultBase {
  readonly kind: "PUBLICATION";
  readonly valid: boolean;
}

const inputType = (input: ProductInput): InferredType => {
  if (input.type === "BOOLEAN") return { valueType: "BOOLEAN" };
  if (input.type === "SELECT" || input.type === "TEXT")
    return { valueType: "STRING" };
  if (input.unit === null)
    return {
      valueType: "DECIMAL",
      unit: null,
      dimension: DIMENSIONS.scalar,
      semantic: "scalar",
    };
  const unit = UNIT_CATALOG[input.unit];
  return {
    valueType: "DECIMAL",
    unit: input.unit,
    dimension: unit.dimension,
    semantic: unit.semantic,
  };
};

export function productInputsToSymbolTable(
  inputs: readonly ProductInput[]
): SymbolTable {
  const symbols: Record<string, SymbolDefinition> = Object.create(
    null
  ) as Record<string, SymbolDefinition>;
  for (const input of inputs)
    symbols[input.key] = {
      key: input.key,
      source: "INPUT",
      type: inputType(input),
    };
  return symbols;
}

const errorIssue = (
  error: unknown,
  path?: string
): EngineeringValidationIssue => ({
  code:
    error instanceof CalculationEngineError ? error.code : "INVALID_EXPRESSION",
  path,
  message:
    error instanceof Error ? error.message : "Expression validation failed",
  severity: "ERROR",
});

const compatibleDecimal = (
  actual: Extract<InferredType, { valueType: "DECIMAL" }>,
  unitId: keyof typeof UNIT_CATALOG
): boolean => {
  const expected = UNIT_CATALOG[unitId];
  return (
    dimensionsEqual(actual.dimension, expected.dimension) &&
    actual.semantic === expected.semantic
  );
};

function semanticIssues(
  definition: ProductVersionDefinition
): EngineeringValidationIssue[] {
  const issues: EngineeringValidationIssue[] = [];
  const symbols: Record<string, SymbolDefinition> = {
    ...productInputsToSymbolTable(definition.inputs),
  };
  let ordered: ReturnType<typeof topologicallySortVariables> = [];
  try {
    ordered = topologicallySortVariables(
      definition.inputs.map(input => input.key),
      definition.variables
    );
  } catch (error) {
    issues.push(errorIssue(error, "variables"));
  }

  for (const orderedVariable of ordered) {
    const variable = definition.variables.find(
      candidate => candidate.key === orderedVariable.key
    )!;
    try {
      const actual = inferExpressionType(variable.expression, symbols);
      symbols[variable.key] = {
        key: variable.key,
        source: "VARIABLE",
        type: actual,
      };
      if (
        variable.expectedValueType &&
        actual.valueType !== variable.expectedValueType
      )
        issues.push({
          code: "VARIABLE_TYPE_MISMATCH",
          path: `variables.${variable.key}.expression`,
          message: `Expected ${variable.expectedValueType}, received ${actual.valueType}`,
          severity: "ERROR",
        });
      if (
        variable.expectedValueType === "DECIMAL" &&
        actual.valueType === "DECIMAL" &&
        Object.hasOwn(variable, "expectedUnit")
      ) {
        const matches =
          variable.expectedUnit === null
            ? dimensionsEqual(actual.dimension, DIMENSIONS.scalar) &&
              actual.semantic === "scalar"
            : compatibleDecimal(actual, variable.expectedUnit!);
        if (!matches)
          issues.push({
            code: "VARIABLE_UNIT_MISMATCH",
            path: `variables.${variable.key}.expression`,
            message: `Expression is incompatible with expected unit ${variable.expectedUnit ?? "scalar"}`,
            severity: "ERROR",
          });
      }
    } catch (error) {
      issues.push(errorIssue(error, `variables.${variable.key}.expression`));
    }
  }

  for (const component of definition.components) {
    if (component.condition) {
      try {
        const condition = inferExpressionType(component.condition, symbols);
        if (condition.valueType !== "BOOLEAN")
          issues.push({
            code: "INVALID_COMPONENT_CONDITION",
            path: `components.${component.id}.condition`,
            message: "Component condition must return BOOLEAN",
            severity: "ERROR",
          });
      } catch (error) {
        issues.push(errorIssue(error, `components.${component.id}.condition`));
      }
    }
    try {
      const quantity = inferExpressionType(
        component.quantityExpression,
        symbols
      );
      if (quantity.valueType !== "DECIMAL")
        issues.push({
          code: "INVALID_COMPONENT_QUANTITY",
          path: `components.${component.id}.quantityExpression`,
          message: "Component quantity must return DECIMAL",
          severity: "ERROR",
        });
      else if (!compatibleDecimal(quantity, component.quantityUnit))
        issues.push({
          code: "COMPONENT_QUANTITY_UNIT_MISMATCH",
          path: `components.${component.id}.quantityExpression`,
          message: `Component quantity is incompatible with ${component.quantityUnit}`,
          severity: "ERROR",
        });
    } catch (error) {
      issues.push(
        errorIssue(error, `components.${component.id}.quantityExpression`)
      );
    }
  }
  return issues;
}

const structuralIssues = (error: z.ZodError): EngineeringValidationIssue[] =>
  error.issues.map(issue => ({
    code: "STRUCTURAL_VALIDATION_ERROR",
    path: issue.path.join("."),
    message: issue.message,
    severity: "ERROR",
  }));

/** Drafts require structural integrity, while unresolved expression references are reported for progressive editing. */
export function validateProductVersionDraft(
  input: unknown
): DraftValidationResult {
  const parsed = productVersionDefinitionSchema.safeParse(input);
  if (!parsed.success)
    return {
      kind: "DRAFT",
      persistable: false,
      issues: structuralIssues(parsed.error),
    };
  return {
    kind: "DRAFT",
    persistable: true,
    issues: semanticIssues(parsed.data),
  };
}

/** Publication/review gates require structural integrity and zero semantic errors. */
export function validateProductVersionForPublication(
  input: unknown
): PublicationValidationResult {
  const parsed = productVersionDefinitionSchema.safeParse(input);
  if (!parsed.success)
    return {
      kind: "PUBLICATION",
      valid: false,
      issues: structuralIssues(parsed.error),
    };
  const issues = semanticIssues(parsed.data);
  return {
    kind: "PUBLICATION",
    valid: !issues.some(issue => issue.severity === "ERROR"),
    issues,
  };
}
