import { describe, expect, expectTypeOf, it } from "vitest";
import { decimalString } from "../calculation-engine/decimal";
import type { Expression } from "../calculation-engine/expressions";
import {
  assertExpectedRevision,
  assertProductVersionEditable,
  assertProductVersionTransition,
  assertValidatedProductVersionTransition,
  nextRevision,
  productInputSchema,
  productVariableSchema,
  productVersionDefinitionSchema,
  productVersionSchema,
  validateProductVersionDraft,
  validateProductVersionForPublication,
  type ProductVersionDefinition,
  type PublicationValidationResult,
} from ".";

const ids = {
  version: "10000000-0000-4000-8000-000000000001",
  product: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  width: "10000000-0000-4000-8000-000000000004",
  height: "10000000-0000-4000-8000-000000000005",
  thickness: "10000000-0000-4000-8000-000000000006",
  painting: "10000000-0000-4000-8000-000000000007",
  installation: "10000000-0000-4000-8000-000000000008",
  area: "10000000-0000-4000-8000-000000000009",
  waste: "10000000-0000-4000-8000-000000000010",
  material: "10000000-0000-4000-8000-000000000011",
  paint: "10000000-0000-4000-8000-000000000012",
  setup: "10000000-0000-4000-8000-000000000013",
  resource: "10000000-0000-4000-8000-000000000014",
};
const ref = (key: string): Expression => ({ type: "reference", key });
const literal = (value: string, unit?: "h" | "un"): Expression => ({
  type: "decimal_literal",
  value: decimalString(value),
  ...(unit ? { unit } : {}),
});
const multiply = (left: Expression, right: Expression): Expression => ({
  type: "binary",
  operator: "MULTIPLY",
  left,
  right,
});

const goldenDefinition = (): ProductVersionDefinition =>
  productVersionDefinitionSchema.parse({
    schemaVersion: "1.0",
    version: {
      id: ids.version,
      productId: ids.product,
      versionNumber: 1,
      revision: 1,
      status: "DRAFT",
      createdAt: "2026-10-03T12:00:00Z",
      createdBy: ids.user,
      publishedAt: null,
      publishedBy: null,
    },
    inputs: [
      {
        id: ids.width,
        key: "width",
        label: "Largura",
        required: true,
        sortOrder: 0,
        type: "DECIMAL",
        unit: "m",
      },
      {
        id: ids.height,
        key: "height",
        label: "Altura",
        required: true,
        sortOrder: 1,
        type: "DECIMAL",
        unit: "m",
      },
      {
        id: ids.thickness,
        key: "thickness",
        label: "Espessura",
        required: true,
        sortOrder: 2,
        type: "SELECT",
        options: [
          { value: "10mm", label: "10 mm" },
          { value: "20mm", label: "20 mm" },
        ],
        defaultValue: "10mm",
      },
      {
        id: ids.painting,
        key: "painting",
        label: "Pintura",
        required: true,
        sortOrder: 3,
        type: "BOOLEAN",
        defaultValue: false,
      },
      {
        id: ids.installation,
        key: "installation",
        label: "Instalação",
        required: true,
        sortOrder: 4,
        type: "BOOLEAN",
        defaultValue: false,
      },
    ],
    variables: [
      {
        id: ids.area,
        key: "area",
        label: "Área",
        sortOrder: 0,
        expression: multiply(ref("width"), ref("height")),
        expectedValueType: "DECIMAL",
        expectedUnit: "m2",
      },
      {
        id: ids.waste,
        key: "area_with_waste",
        label: "Área com perda",
        sortOrder: 1,
        expression: multiply(ref("area"), literal("1.10")),
        expectedValueType: "DECIMAL",
        expectedUnit: "m2",
      },
    ],
    components: [
      {
        id: ids.material,
        type: "MATERIAL",
        label: "PVC",
        sortOrder: 0,
        quantityScope: "PER_UNIT",
        quantityExpression: ref("area_with_waste"),
        quantityUnit: "m2",
        materialId: ids.resource,
      },
      {
        id: ids.paint,
        type: "PROCESS",
        label: "Pintura",
        sortOrder: 1,
        quantityScope: "PER_UNIT",
        condition: ref("painting"),
        quantityExpression: literal("1", "h"),
        quantityUnit: "h",
        processDefinitionId: ids.resource,
      },
      {
        id: ids.setup,
        type: "FIXED_COST",
        label: "Preparação CNC",
        sortOrder: 2,
        quantityScope: "PER_QUOTE_ITEM",
        quantityExpression: literal("1", "un"),
        quantityUnit: "un",
        fixedCostDefinitionId: ids.resource,
      },
    ],
  });

describe("product engineering validation", () => {
  it("validates the Letreiro PVC golden case without commercial quantity", () => {
    const definition = goldenDefinition();
    expect(JSON.stringify(definition)).not.toContain("commercial_quantity");
    expect(validateProductVersionForPublication(definition)).toEqual({
      kind: "PUBLICATION",
      valid: true,
      issues: [],
    });
  });
  it("allows unresolved references in a structurally valid draft but blocks publication", () => {
    const definition = goldenDefinition();
    definition.variables[0].expression = multiply(
      ref("width"),
      ref("missing_height")
    );
    const draft = validateProductVersionDraft(definition);
    expect(draft).toMatchObject({ kind: "DRAFT", persistable: true });
    expect(draft.issues.some(issue => issue.code === "UNKNOWN_REFERENCE")).toBe(
      true
    );
    expect(validateProductVersionForPublication(definition).valid).toBe(false);
  });
  it("rejects duplicate ids within each aggregate collection", () => {
    for (const collection of ["inputs", "variables", "components"] as const) {
      const definition = goldenDefinition();
      definition[collection][1].id = definition[collection][0].id;
      expect(productVersionDefinitionSchema.safeParse(definition).success).toBe(
        false
      );
    }
  });
  it("reports cycles and input-variable collisions", () => {
    const cyclic = goldenDefinition();
    cyclic.variables = [
      { ...cyclic.variables[0], key: "a", expression: ref("b") },
      { ...cyclic.variables[1], key: "b", expression: ref("a") },
    ];
    expect(validateProductVersionForPublication(cyclic).issues[0].code).toBe(
      "CYCLIC_DEPENDENCY"
    );
    const collision = goldenDefinition();
    collision.variables[0].key = "width";
    expect(validateProductVersionForPublication(collision)).toMatchObject({
      valid: false,
      issues: [{ code: "STRUCTURAL_VALIDATION_ERROR" }],
    });
  });
  it("rejects mismatched quantity units, conditions, and expected variable units", () => {
    const quantity = goldenDefinition();
    quantity.components[0].quantityUnit = "kg";
    expect(
      validateProductVersionForPublication(quantity).issues.some(
        issue => issue.code === "COMPONENT_QUANTITY_UNIT_MISMATCH"
      )
    ).toBe(true);
    const condition = goldenDefinition();
    condition.components[0].condition = ref("area");
    expect(
      validateProductVersionForPublication(condition).issues.some(
        issue => issue.code === "INVALID_COMPONENT_CONDITION"
      )
    ).toBe(true);
    const expected = goldenDefinition();
    expected.variables[0].expectedUnit = "m";
    expect(
      validateProductVersionForPublication(expected).issues.some(
        issue => issue.code === "VARIABLE_UNIT_MISMATCH"
      )
    ).toBe(true);
  });
  it("validates select option identities independently from labels", () => {
    const base = {
      id: ids.thickness,
      key: "thickness",
      label: "Espessura",
      required: true,
      sortOrder: 0,
      type: "SELECT" as const,
    };
    expect(
      productInputSchema.safeParse({
        ...base,
        options: [
          { value: "10", label: "same" },
          { value: "20", label: "same" },
        ],
        defaultValue: "20",
      }).success
    ).toBe(true);
    expect(
      productInputSchema.safeParse({
        ...base,
        options: [
          { value: "10", label: "a" },
          { value: "10", label: "b" },
        ],
      }).success
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...base,
        options: [{ value: "10", label: "a" }],
        defaultValue: "20",
      }).success
    ).toBe(false);
  });
});

describe("field invariants", () => {
  const variable = {
    id: ids.area,
    key: "area",
    label: "Área",
    expression: ref("width"),
    sortOrder: 0,
  };
  it.each([
    [{ expectedValueType: "DECIMAL", expectedUnit: "m2" }, true],
    [{ expectedValueType: "DECIMAL", expectedUnit: null }, true],
    [{ expectedValueType: "BOOLEAN", expectedUnit: null }, false],
    [{ expectedValueType: "STRING", expectedUnit: "m" }, false],
  ] as const)("validates expectedUnit presence for %#", (expected, valid) => {
    expect(
      productVariableSchema.safeParse({ ...variable, ...expected }).success
    ).toBe(valid);
  });

  const version = {
    id: ids.version,
    productId: ids.product,
    versionNumber: 1,
    revision: 1,
    createdAt: "2026-10-03T12:00:00Z",
    createdBy: ids.user,
  };
  it.each([
    ["DRAFT", null, null, true],
    ["VALIDATING", null, null, true],
    ["DRAFT", "2026-10-03T13:00:00Z", ids.user, false],
    ["VALIDATING", "2026-10-03T13:00:00Z", ids.user, false],
    ["PUBLISHED", null, null, false],
    ["PUBLISHED", "2026-10-03T13:00:00Z", ids.user, true],
    ["RETIRED", null, null, false],
    ["RETIRED", "2026-10-03T13:00:00Z", ids.user, true],
  ] as const)(
    "validates publication metadata for %s (%#)",
    (status, publishedAt, publishedBy, valid) => {
      expect(
        productVersionSchema.safeParse({
          ...version,
          status,
          publishedAt,
          publishedBy,
        }).success
      ).toBe(valid);
    }
  );

  const decimalInput = {
    id: ids.width,
    key: "width",
    label: "Largura",
    required: true,
    sortOrder: 0,
    type: "DECIMAL",
    unit: "m",
  } as const;
  it("requires defaults and request-independence for configuration inputs", () => {
    expect(
      productInputSchema.safeParse({
        ...decimalInput,
        required: false,
        scope: "CONFIGURATION",
        defaultValue: "2",
      }).success
    ).toBe(true);
    expect(
      productInputSchema.safeParse({
        ...decimalInput,
        required: true,
        scope: "CONFIGURATION",
        defaultValue: "2",
      }).success
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...decimalInput,
        required: false,
        scope: "CONFIGURATION",
      }).success
    ).toBe(false);
  });

  it.each([
    [{ min: "0.1", max: "0.2" }, true],
    [{ min: "0.2", max: "0.2" }, true],
    [{ min: "0.2", max: "0.1" }, false],
    [{ min: "0", max: "10", defaultValue: "5" }, true],
    [{ min: "0.1", max: "10", defaultValue: "0.01" }, false],
    [{ min: "0", max: "0.2", defaultValue: "0.21" }, false],
  ] as const)("validates decimal bounds for %#", (bounds, valid) => {
    expect(
      productInputSchema.safeParse({ ...decimalInput, ...bounds }).success
    ).toBe(valid);
  });
});

describe("lifecycle and optimistic locking", () => {
  it.each([
    ["DRAFT", "VALIDATING"],
    ["VALIDATING", "DRAFT"],
    ["VALIDATING", "PUBLISHED"],
    ["PUBLISHED", "RETIRED"],
  ] as const)("allows %s → %s", (from, to) =>
    expect(() => assertProductVersionTransition(from, to)).not.toThrow()
  );
  it.each([
    ["DRAFT", "PUBLISHED"],
    ["PUBLISHED", "DRAFT"],
    ["RETIRED", "DRAFT"],
    ["RETIRED", "PUBLISHED"],
  ] as const)("blocks %s → %s", (from, to) =>
    expect(() => assertProductVersionTransition(from, to)).toThrowError(
      expect.objectContaining({ code: "INVALID_STATUS_TRANSITION" })
    )
  );
  it.each(["VALIDATING", "PUBLISHED", "RETIRED"] as const)(
    "makes %s immutable",
    status =>
      expect(() => assertProductVersionEditable({ status })).toThrowError(
        expect.objectContaining({ code: "VERSION_NOT_EDITABLE" })
      )
  );
  it("keeps DRAFT editable and gates review transitions on validation", () => {
    expectTypeOf(assertValidatedProductVersionTransition)
      .parameter(2)
      .toEqualTypeOf<PublicationValidationResult>();
    expect(() =>
      assertProductVersionEditable({ status: "DRAFT" })
    ).not.toThrow();
    expect(() =>
      assertValidatedProductVersionTransition("DRAFT", "VALIDATING", {
        kind: "PUBLICATION",
        valid: false,
        issues: [],
      })
    ).toThrowError(
      expect.objectContaining({ code: "PUBLICATION_VALIDATION_FAILED" })
    );
    expect(() =>
      assertValidatedProductVersionTransition("DRAFT", "VALIDATING", {
        kind: "PUBLICATION",
        valid: true,
        issues: [],
      })
    ).not.toThrow();
  });
  it("detects stale revisions and increments matching revisions", () => {
    expect(nextRevision(8, 8)).toBe(9);
    expect(() => assertExpectedRevision(8, 7)).toThrowError(
      expect.objectContaining({ code: "REVISION_CONFLICT" })
    );
  });
});
