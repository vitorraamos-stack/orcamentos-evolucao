import { describe, expect, it } from "vitest";
import {
  mapComponent,
  mapDefinition,
  mapInput,
  mapVariable,
  variableToRow,
} from "./mappers";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const baseInput = {
  id: id(1),
  key: "size",
  label: "Size",
  description: null,
  required: true,
  sort_order: 0,
};
describe("Product Engineering persistence mappers", () => {
  it.each([
    "0.1",
    "10.000000000000000001",
    "12345678901234567890.12345678901234567890",
  ])("preserves decimal text %s", value => {
    const mapped = mapInput({
      ...baseInput,
      type: "DECIMAL",
      unit: null,
      decimal_default: value,
      decimal_min: value,
      decimal_max: value,
    });
    expect(mapped).toMatchObject({
      defaultValue: value,
      min: value,
      max: value,
    });
    expect(typeof (mapped as any).defaultValue).toBe("string");
  });
  it("maps every input discriminator", () => {
    expect(
      mapInput({ ...baseInput, type: "BOOLEAN", boolean_default: false }).type
    ).toBe("BOOLEAN");
    expect(
      mapInput({
        ...baseInput,
        type: "SELECT",
        select_options: [{ value: "x", label: "X" }],
        select_default: "x",
      })
    ).toMatchObject({ options: [{ value: "x", label: "X" }] });
    expect(
      mapInput({
        ...baseInput,
        type: "TEXT",
        text_default: "a",
        text_max_length: 2,
      })
    ).toMatchObject({ defaultValue: "a", maxLength: 2 });
  });
  it.each([
    [false, null, false],
    [true, null, true],
    [true, "m2", true],
  ] as const)(
    "preserves expectedUnit presence %#",
    (enforce, unit, present) => {
      const mapped = mapVariable({
        id: id(2),
        key: "area",
        label: "Area",
        expression: { type: "decimal_literal", value: "1" },
        sort_order: 0,
        expected_value_type: "DECIMAL",
        expected_unit: unit,
        enforce_expected_unit: enforce,
      });
      expect(Object.hasOwn(mapped, "expectedUnit")).toBe(present);
      expect(variableToRow(mapped).enforce_expected_unit).toBe(enforce);
    }
  );
  it.each([
    ["MATERIAL", "materialId"],
    ["PROCESS", "processDefinitionId"],
    ["OUTSOURCED_SERVICE", "outsourcedServiceId"],
    ["FIXED_COST", "fixedCostDefinitionId"],
  ] as const)("maps %s resource", (type, key) => {
    const row: any = {
      id: id(3),
      component_type: type,
      label: "Item",
      sort_order: 3,
      quantity_scope: "PER_UNIT",
      condition_expression: null,
      quantity_expression: { type: "decimal_literal", value: "1", unit: "un" },
      quantity_unit: "un",
      material_id: id(4),
      process_definition_id: id(4),
      outsourced_service_id: id(4),
      fixed_cost_definition_id: id(4),
    };
    const mapped: any = mapComponent(row);
    expect(mapped[key]).toBe(id(4));
    expect(mapped.condition).toBeNull();
    expect(mapped.sortOrder).toBe(3);
  });
  it("maps and canonically validates a complete definition", () => {
    const dto = {
      schema_version: "1.0",
      expression_ast_version: "1.0",
      version: {
        id: id(5),
        product_id: id(6),
        version_number: 1,
        status: "DRAFT",
        revision: 1,
        notes: null,
        created_at: "2026-10-04T00:00:00Z",
        created_by: id(7),
        published_at: null,
        published_by: null,
      },
      inputs: [],
      variables: [],
      components: [],
    };
    expect(mapDefinition(dto).version.revision).toBe(1);
    expect(() =>
      mapDefinition({ ...dto, expression_ast_version: "2.0" })
    ).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_EXPRESSION_AST_VERSION" })
    );
  });
});
