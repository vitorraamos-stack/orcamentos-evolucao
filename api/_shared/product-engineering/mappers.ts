import {
  productComponentSchema,
  productInputSchema,
  productSchema,
  productVariableSchema,
  productVersionDefinitionSchema,
  productVersionSchema,
  PRODUCT_ENGINEERING_SCHEMA_VERSION,
  createProductResultSchema,
  createVersionResultSchema,
} from "../../../shared/product-engineering/index.js";
import { EXPRESSION_AST_VERSION } from "../../../shared/calculation-engine/expressions/index.js";
import { decimalStringSchema } from "../../../shared/calculation-engine/decimal/index.js";

export class CompatibilityError extends Error {
  constructor(
    readonly code:
      | "UNSUPPORTED_PRODUCT_ENGINEERING_SCHEMA"
      | "UNSUPPORTED_EXPRESSION_AST_VERSION"
  ) {
    super(code);
  }
}
export const mapProduct = (r: any) =>
  productSchema.parse({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
export const mapVersion = (r: any) =>
  productVersionSchema.parse({
    id: r.id,
    productId: r.product_id,
    versionNumber: r.version_number,
    status: r.status,
    revision: r.revision,
    notes: r.notes,
    createdAt: r.created_at,
    createdBy: r.created_by,
    publishedAt: r.published_at,
    publishedBy: r.published_by,
  });
const parsePersistedDecimal = (value: unknown, field: string) => {
  if (value == null) return undefined;
  if (typeof value !== "string")
    throw new TypeError(field + " must be persisted as a decimal string");
  return decimalStringSchema.parse(value);
};
export const mapInput = (r: any) => {
  const base = {
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description,
    required: r.required,
    sortOrder: r.sort_order,
    type: r.type,
  };
  if (r.type === "DECIMAL") {
    const defaultValue = parsePersistedDecimal(
      r.decimal_default,
      "decimal_default"
    );
    const min = parsePersistedDecimal(r.decimal_min, "decimal_min");
    const max = parsePersistedDecimal(r.decimal_max, "decimal_max");
    return productInputSchema.parse({
      ...base,
      unit: r.unit,
      ...(defaultValue === undefined ? {} : { defaultValue }),
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    });
  }
  if (r.type === "BOOLEAN")
    return productInputSchema.parse({
      ...base,
      ...(r.boolean_default == null ? {} : { defaultValue: r.boolean_default }),
    });
  if (r.type === "SELECT")
    return productInputSchema.parse({
      ...base,
      options: r.select_options,
      ...(r.select_default == null ? {} : { defaultValue: r.select_default }),
    });
  return productInputSchema.parse({
    ...base,
    ...(r.text_default == null ? {} : { defaultValue: r.text_default }),
    ...(r.text_max_length == null ? {} : { maxLength: r.text_max_length }),
  });
};
export const mapVariable = (r: any) =>
  productVariableSchema.parse({
    id: r.id,
    key: r.key,
    label: r.label,
    expression: r.expression,
    sortOrder: r.sort_order,
    ...(r.expected_value_type == null
      ? {}
      : { expectedValueType: r.expected_value_type }),
    ...(r.enforce_expected_unit ? { expectedUnit: r.expected_unit } : {}),
  });
export const mapComponent = (r: any) =>
  productComponentSchema.parse({
    id: r.id,
    type: r.component_type,
    label: r.label,
    sortOrder: r.sort_order,
    quantityScope: r.quantity_scope,
    condition: r.condition_expression,
    quantityExpression: r.quantity_expression,
    quantityUnit: r.quantity_unit,
    ...(r.component_type === "MATERIAL"
      ? { materialId: r.material_id }
      : r.component_type === "PROCESS"
        ? { processDefinitionId: r.process_definition_id }
        : r.component_type === "OUTSOURCED_SERVICE"
          ? { outsourcedServiceId: r.outsourced_service_id }
          : { fixedCostDefinitionId: r.fixed_cost_definition_id }),
  });

export function mapDefinition(dto: any) {
  if (dto.schema_version !== PRODUCT_ENGINEERING_SCHEMA_VERSION)
    throw new CompatibilityError("UNSUPPORTED_PRODUCT_ENGINEERING_SCHEMA");
  if (dto.expression_ast_version !== EXPRESSION_AST_VERSION)
    throw new CompatibilityError("UNSUPPORTED_EXPRESSION_AST_VERSION");
  return productVersionDefinitionSchema.parse({
    schemaVersion: dto.schema_version,
    version: mapVersion(dto.version),
    inputs: (dto.inputs ?? []).map(mapInput),
    variables: (dto.variables ?? []).map(mapVariable),
    components: (dto.components ?? []).map(mapComponent),
  });
}

export const mapCreateProductResult = (r: any) =>
  createProductResultSchema.parse({
    productId: r.product_id,
    versionId: r.version_id,
    revision: r.revision,
  });

export const mapCreateVersionResult = (r: any) =>
  createVersionResultSchema.parse({
    productId: r.product_id,
    sourceVersionId: r.source_version_id,
    versionId: r.version_id,
    versionNumber: r.version_number,
    revision: r.revision,
  });

export const inputToRow = (i: any) => ({
  id: i.id,
  key: i.key,
  label: i.label,
  description: i.description ?? null,
  type: i.type,
  required: i.required,
  sort_order: i.sortOrder,
  unit: i.type === "DECIMAL" ? i.unit : null,
  decimal_default: i.type === "DECIMAL" ? (i.defaultValue ?? null) : null,
  decimal_min: i.type === "DECIMAL" ? (i.min ?? null) : null,
  decimal_max: i.type === "DECIMAL" ? (i.max ?? null) : null,
  boolean_default: i.type === "BOOLEAN" ? (i.defaultValue ?? null) : null,
  select_options: i.type === "SELECT" ? i.options : null,
  select_default: i.type === "SELECT" ? (i.defaultValue ?? null) : null,
  text_default: i.type === "TEXT" ? (i.defaultValue ?? null) : null,
  text_max_length: i.type === "TEXT" ? (i.maxLength ?? null) : null,
});
export const variableToRow = (v: any) => ({
  id: v.id,
  key: v.key,
  label: v.label,
  expression: v.expression,
  sort_order: v.sortOrder,
  expected_value_type: v.expectedValueType ?? null,
  expected_unit: Object.hasOwn(v, "expectedUnit") ? v.expectedUnit : null,
  enforce_expected_unit: Object.hasOwn(v, "expectedUnit"),
});
export const componentToRow = (c: any) => ({
  id: c.id,
  component_type: c.type,
  label: c.label,
  sort_order: c.sortOrder,
  quantity_scope: c.quantityScope,
  condition_expression: c.condition ?? null,
  quantity_expression: c.quantityExpression,
  quantity_unit: c.quantityUnit,
  material_id: c.type === "MATERIAL" ? c.materialId : null,
  process_definition_id: c.type === "PROCESS" ? c.processDefinitionId : null,
  outsourced_service_id:
    c.type === "OUTSOURCED_SERVICE" ? c.outsourcedServiceId : null,
  fixed_cost_definition_id:
    c.type === "FIXED_COST" ? c.fixedCostDefinitionId : null,
});
