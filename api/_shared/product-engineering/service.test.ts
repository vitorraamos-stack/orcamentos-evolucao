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
    published_at:
      status === "PUBLISHED" || status === "RETIRED"
        ? "2026-10-04T01:00:00Z"
        : null,
    published_by:
      status === "PUBLISHED" || status === "RETIRED" ? id(9) : null,
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
const versionRow = (status: string, published = false) => ({
  ...dto(status).version,
  ...(published
    ? { published_at: "2026-10-04T01:00:00Z", published_by: id(9) }
    : {}),
});
describe("ProductEngineeringService", () => {
  it("clones a published source and maps the result with the authenticated actor", async () => {
    const source = dto("PUBLISHED", 3);
    const mock: any = db(source);
    mock.rpc.mockImplementation(async (name: string) =>
      name.includes("get_version")
        ? { data: source, error: null }
        : {
            data: {
              product_id: id(2),
              source_version_id: id(1),
              version_id: id(8),
              version_number: 2,
              revision: 1,
            },
            error: null,
          }
    );

    const result: any = await new ProductEngineeringService(mock).execute(
      {
        action: "CREATE_VERSION",
        sourceVersionId: id(1),
        expectedRevision: 3,
      },
      id(7)
    );

    expect(mock.rpc).toHaveBeenLastCalledWith(
      "product_engineering_create_version_secure",
      {
        p_source_version_id: id(1),
        p_expected_revision: 3,
        p_actor_id: id(7),
      }
    );
    expect(result).toEqual({
      productId: id(2),
      sourceVersionId: id(1),
      versionId: id(8),
      versionNumber: 2,
      revision: 1,
    });
    expect(result).not.toHaveProperty("source_version_id");
  });
  it.each(["DRAFT", "VALIDATING", "RETIRED"])(
    "rejects cloning a %s source before mutation",
    async status => {
      const mock = db(dto(status));
      await expect(
        new ProductEngineeringService(mock).execute(
          {
            action: "CREATE_VERSION",
            sourceVersionId: id(1),
            expectedRevision: 1,
          },
          id(3)
        )
      ).rejects.toMatchObject({ status: 409, code: "STATE_CONFLICT" });
      expect(mock.rpc).toHaveBeenCalledTimes(1);
    }
  );
  it("rejects stale clone revisions before mutation", async () => {
    const mock = db(dto("PUBLISHED", 2));
    await expect(
      new ProductEngineeringService(mock).execute(
        {
          action: "CREATE_VERSION",
          sourceVersionId: id(1),
          expectedRevision: 1,
        },
        id(3)
      )
    ).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
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
  it("rejects a structurally invalid aggregate without saving", async () => {
    const mock = db();
    const duplicate: any = {
      id: id(4),
      key: "width",
      label: "Width",
      required: true,
      sortOrder: 0,
      type: "DECIMAL",
      unit: "m",
    };
    await expect(
      new ProductEngineeringService(mock).execute(
        {
          action: "SAVE_DRAFT",
          versionId: id(1),
          expectedRevision: 1,
          inputs: [duplicate, { ...duplicate, key: "height" }],
          variables: [],
          components: [],
        },
        id(3)
      )
    ).rejects.toMatchObject({ status: 400, code: "DOMAIN_VALIDATION_FAILED" });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("starts validation and maps the version", async () => {
    const mock: any = db();
    mock.rpc.mockImplementation(async (name: string) =>
      name.includes("get_version")
        ? { data: dto(), error: null }
        : { data: versionRow("VALIDATING"), error: null }
    );
    const result: any = await new ProductEngineeringService(mock).execute(
      { action: "START_VALIDATION", versionId: id(1), expectedRevision: 1 },
      id(3)
    );
    expect(mock.rpc).toHaveBeenLastCalledWith(
      "product_engineering_transition_version_secure",
      expect.objectContaining({ p_target_status: "VALIDATING" })
    );
    expect(result.version).toMatchObject({
      status: "VALIDATING",
      productId: id(2),
      versionNumber: 1,
    });
    expect(result.version).not.toHaveProperty("product_id");
  });
  it("publishes with the observed version and authenticated actor", async () => {
    const target = dto("VALIDATING");
    const mock: any = db(target);
    const publishedId = id(8);
    mock.from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: publishedId },
              error: null,
            }),
          }),
        }),
      }),
    }));
    mock.rpc.mockImplementation(async (name: string) =>
      name.includes("get_version")
        ? { data: target, error: null }
        : { data: versionRow("PUBLISHED", true), error: null }
    );
    const result: any = await new ProductEngineeringService(mock).execute(
      { action: "PUBLISH_VERSION", versionId: id(1), expectedRevision: 1 },
      id(7)
    );
    expect(mock.rpc).toHaveBeenLastCalledWith(
      "product_engineering_publish_version_secure",
      expect.objectContaining({
        p_expected_current_published_version_id: publishedId,
        p_actor_id: id(7),
      })
    );
    expect(result.version).toMatchObject({
      productId: id(2),
      versionNumber: 1,
      publishedAt: "2026-10-04T01:00:00Z",
      publishedBy: id(9),
    });
    expect(result.version).not.toHaveProperty("product_id");
  });
  it("does not publish invalid or stale definitions", async () => {
    const invalid = dto("VALIDATING");
    invalid.variables = [
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
    for (const [definition, expected] of [
      [invalid, { status: 400 }],
      [dto("VALIDATING", 2), { code: "REVISION_CONFLICT" }],
    ] as const) {
      const mock = db(definition);
      await expect(
        new ProductEngineeringService(mock).execute(
          { action: "PUBLISH_VERSION", versionId: id(1), expectedRevision: 1 },
          id(3)
        )
      ).rejects.toMatchObject(expected);
      expect(mock.rpc).toHaveBeenCalledTimes(1);
    }
  });
  it("classifies publication concurrency separately", async () => {
    const target = dto("VALIDATING");
    const mock: any = db(target);
    mock.from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }));
    mock.rpc.mockImplementation(async (name: string) =>
      name.includes("get_version")
        ? { data: target, error: null }
        : {
            data: null,
            error: { message: "current published version changed" },
          }
    );
    await expect(
      new ProductEngineeringService(mock).execute(
        { action: "PUBLISH_VERSION", versionId: id(1), expectedRevision: 1 },
        id(3)
      )
    ).rejects.toMatchObject({ status: 409, code: "PUBLICATION_CONFLICT" });
  });
});
