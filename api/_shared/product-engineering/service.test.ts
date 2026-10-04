import { describe, expect, it, vi } from "vitest";
import { ProductEngineeringService, ServiceError } from "./service";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dto = (status = "DRAFT", revision = 1) => ({
  schema_version: "1.0",
  expression_ast_version: "1.0",
  version: {
    id: id(1),
    product_id: id(2),
    version_number: 1,
    status,
    revision,
    notes: null,
    created_at: "2026-10-04T00:00:00Z",
    created_by: id(3),
    published_at: null,
    published_by: null,
  },
  inputs: [],
  variables: [],
  components: [],
});
const db = (definition: any = dto()) => ({
  rpc: vi.fn(async (name: string) =>
    name.includes("get_version")
      ? { data: definition, error: null }
      : { data: 2, error: null }
  ),
  from: vi.fn(),
});
describe("ProductEngineeringService", () => {
  it("allows persistable drafts with semantic issues and returns them", async () => {
    const d = dto();
    d.inputs = [
      {
        id: id(4),
        key: "width",
        label: "Width",
        required: true,
        sort_order: 0,
        type: "DECIMAL",
        unit: "m",
        decimal_default: null,
        decimal_min: null,
        decimal_max: null,
      },
    ];
    d.variables = [
      {
        id: id(5),
        key: "bad",
        label: "Bad",
        sort_order: 0,
        expression: { type: "reference", key: "missing" },
        expected_value_type: null,
        expected_unit: null,
        enforce_expected_unit: false,
      },
    ];
    const mock = db(d);
    const result: any = await new ProductEngineeringService(mock).execute(
      {
        action: "SAVE_DRAFT",
        versionId: id(1),
        expectedRevision: 1,
        notes: null,
        inputs: [
          {
            id: id(4) as any,
            key: "width",
            label: "Width",
            required: true,
            sortOrder: 0,
            type: "DECIMAL",
            unit: "m",
          },
        ],
        variables: [
          {
            id: id(5) as any,
            key: "bad",
            label: "Bad",
            sortOrder: 0,
            expression: { type: "reference", key: "missing" },
          },
        ],
        components: [],
      },
      id(3)
    );
    expect(result.issues.length).toBeGreaterThan(0);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });
  it("rejects revision conflicts before mutation", async () => {
    const mock = db(dto("DRAFT", 2));
    await expect(
      new ProductEngineeringService(mock).execute(
        { action: "START_VALIDATION", versionId: id(1), expectedRevision: 1 },
        id(3)
      )
    ).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not transition a semantically invalid definition", async () => {
    const d = dto();
    d.variables = [
      {
        id: id(5),
        key: "bad",
        label: "Bad",
        sort_order: 0,
        expression: { type: "reference", key: "missing" },
        expected_value_type: null,
        expected_unit: null,
        enforce_expected_unit: false,
      },
    ];
    const mock = db(d);
    await expect(
      new ProductEngineeringService(mock).execute(
        { action: "START_VALIDATION", versionId: id(1), expectedRevision: 1 },
        id(3)
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects saves outside DRAFT", async () => {
    const mock = db(dto("VALIDATING"));
    await expect(
      new ProductEngineeringService(mock).execute(
        {
          action: "SAVE_DRAFT",
          versionId: id(1),
          expectedRevision: 1,
          inputs: [],
          variables: [],
          components: [],
        },
        id(3)
      )
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
