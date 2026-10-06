import { describe, expect, it, vi } from "vitest";
import {
  PricingPersistenceService,
  PricingPersistenceServiceError,
  mapPricingPersistenceError,
} from "./service";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-06T12:00:00Z";

const aggregate = (status = "DRAFT", revision = 1) => ({
  schema_version: "1.0",
  engine_version: "1.0",
  policy: {
    id: id(1),
    code: "STANDARD",
    name: "Standard",
    description: null,
    status: "ACTIVE",
  },
  version: {
    id: id(2),
    pricing_policy_id: id(1),
    version_number: 1,
    revision,
    status,
    notes: null,
    created_at: now,
    created_by: id(3),
    published_at:
      status === "PUBLISHED" || status === "RETIRED" ? now : null,
    published_by:
      status === "PUBLISHED" || status === "RETIRED" ? id(3) : null,
  },
  strategy_type: "MARKUP_ON_COST",
  markup: "1",
  markup_base: "TOTAL_COST",
  charges: [],
});

const db = (definition: any = aggregate()) => ({
  rpc: vi.fn(async (name: string) => {
    if (name === "pricing_get_version_definition_secure")
      return { data: definition, error: null };
    return { data: { revision: 2 }, error: null };
  }),
});

describe("PricingPersistenceService", () => {
  it("creates a policy with fixed approved strategy/base and authenticated actor", async () => {
    const mock: any = db();
    mock.rpc.mockResolvedValueOnce({
      data: {
        policy_id: id(1),
        version_id: id(2),
        policy_revision: 1,
        version_revision: 1,
      },
      error: null,
    });
    const result = await new PricingPersistenceService(mock).execute(
      {
        action: "CREATE_POLICY",
        policy: {
          code: "STANDARD",
          name: "Standard",
          status: "ACTIVE",
        },
        markup: "1",
      },
      id(9)
    );
    expect(mock.rpc).toHaveBeenCalledWith(
      "pricing_create_policy_secure",
      expect.objectContaining({
        p_actor_id: id(9),
        p_schema_version: "1.0",
        p_engine_version: "1.0",
        p_strategy_type: "MARKUP_ON_COST",
        p_markup_base: "TOTAL_COST",
        p_markup: "1",
      })
    );
    expect(result).toMatchObject({ policyId: id(1), versionId: id(2) });
  });

  it("rejects stale versions before mutation", async () => {
    const mock = db(aggregate("DRAFT", 2));
    await expect(
      new PricingPersistenceService(mock).execute(
        {
          action: "SAVE_DRAFT",
          versionId: id(2),
          expectedRevision: 1,
          markup: "1.1",
        },
        id(9)
      )
    ).rejects.toMatchObject({
      status: 409,
      code: "PRICING_REVISION_CONFLICT",
    });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects all version mutations under an archived policy", async () => {
    const archived = aggregate("DRAFT");
    archived.policy.status = "ARCHIVED";
    const mock = db(archived);
    await expect(
      new PricingPersistenceService(mock).execute(
        {
          action: "SAVE_DRAFT",
          versionId: id(2),
          expectedRevision: 1,
          markup: "1.1",
        },
        id(9)
      )
    ).rejects.toMatchObject({
      status: 409,
      code: "PRICING_STATE_CONFLICT",
    });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("clones only a PUBLISHED source", async () => {
    const mock = db(aggregate("DRAFT"));
    await expect(
      new PricingPersistenceService(mock).execute(
        {
          action: "CREATE_VERSION",
          sourceVersionId: id(2),
          expectedRevision: 1,
        },
        id(9)
      )
    ).rejects.toMatchObject({
      status: 409,
      code: "PRICING_STATE_CONFLICT",
    });
  });

  it("returns VALIDATING to DRAFT with a new revision", async () => {
    const validating = aggregate("VALIDATING", 4);
    const draftRow = {
      ...aggregate("DRAFT", 5).version,
      status: "DRAFT",
      revision: 5,
    };
    const mock: any = db(validating);
    mock.rpc
      .mockResolvedValueOnce({ data: validating, error: null })
      .mockResolvedValueOnce({ data: draftRow, error: null });

    const result: any = await new PricingPersistenceService(mock).execute(
      {
        action: "RETURN_TO_DRAFT",
        versionId: id(2),
        expectedRevision: 4,
      },
      id(9)
    );

    expect(mock.rpc).toHaveBeenLastCalledWith(
      "pricing_transition_version_secure",
      expect.objectContaining({
        p_expected_revision: 4,
        p_target_status: "DRAFT",
      })
    );
    expect(result.version).toMatchObject({ status: "DRAFT", revision: 5 });
  });

  it("starts validation only after readiness succeeds", async () => {
    const mock: any = db(aggregate("DRAFT"));
    mock.rpc
      .mockResolvedValueOnce({ data: aggregate("DRAFT"), error: null })
      .mockResolvedValueOnce({
        data: { ...aggregate("VALIDATING").version },
        error: null,
      });
    const result: any = await new PricingPersistenceService(mock).execute(
      {
        action: "START_VALIDATION",
        versionId: id(2),
        expectedRevision: 1,
      },
      id(9)
    );
    expect(mock.rpc).toHaveBeenLastCalledWith(
      "pricing_transition_version_secure",
      expect.objectContaining({
        p_target_status: "VALIDATING",
        p_actor_id: id(9),
      })
    );
    expect(result.version.status).toBe("VALIDATING");
  });

  it("preserves the caller-observed published version through the CAS", async () => {
    const validating = aggregate("VALIDATING");
    const publishedRow = {
      ...aggregate("PUBLISHED").version,
      status: "PUBLISHED",
      published_at: now,
      published_by: id(9),
    };
    const mock: any = db(validating);
    mock.rpc
      .mockResolvedValueOnce({ data: validating, error: null })
      .mockResolvedValueOnce({ data: publishedRow, error: null });
    const result: any = await new PricingPersistenceService(mock).execute(
      {
        action: "PUBLISH_VERSION",
        versionId: id(2),
        expectedRevision: 1,
        expectedCurrentPublishedVersionId: id(8),
      },
      id(9)
    );
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.rpc).toHaveBeenLastCalledWith(
      "pricing_publish_version_secure",
      expect.objectContaining({
        p_expected_current_published_version_id: id(8),
        p_actor_id: id(9),
      })
    );
    expect(
      mock.rpc.mock.calls.some(
        ([name]: [string]) =>
          name === "pricing_get_current_published_version_id_secure"
      )
    ).toBe(false);
    expect(result.version.status).toBe("PUBLISHED");
  });

  it("supports first publication by preserving an explicit null expectation", async () => {
    const validating = aggregate("VALIDATING");
    const publishedRow = {
      ...aggregate("PUBLISHED").version,
      status: "PUBLISHED",
      published_at: now,
      published_by: id(9),
    };
    const mock: any = db(validating);
    mock.rpc
      .mockResolvedValueOnce({ data: validating, error: null })
      .mockResolvedValueOnce({ data: publishedRow, error: null });
    await new PricingPersistenceService(mock).execute(
      {
        action: "PUBLISH_VERSION",
        versionId: id(2),
        expectedRevision: 1,
        expectedCurrentPublishedVersionId: null,
      },
      id(9)
    );
    expect(mock.rpc).toHaveBeenLastCalledWith(
      "pricing_publish_version_secure",
      expect.objectContaining({
        p_expected_current_published_version_id: null,
      })
    );
  });

  it("sends product minimum and payment rates as decimal text", async () => {
    const mock: any = db();
    mock.rpc
      .mockResolvedValueOnce({
        data: {
          id: id(1),
          code: "STANDARD",
          name: "Standard",
          description: null,
          status: "ACTIVE",
          revision: 1,
          created_at: now,
          created_by: id(9),
          updated_at: now,
          updated_by: id(9),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          product_id: id(4),
          pricing_policy_id: id(1),
          minimum_selling_price: "250.00",
          revision: 1,
          updated_at: now,
          updated_by: id(9),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          installments: 6,
          rate: "0.055",
          revision: 1,
          updated_at: now,
          updated_by: id(9),
        },
        error: null,
      });
    const service = new PricingPersistenceService(mock);
    const settings = await service.execute(
      {
        action: "SET_PRODUCT_PRICING",
        productId: id(4),
        pricingPolicyId: id(1),
        minimumSellingPrice: "250.00",
        expectedRevision: null,
      },
      id(9)
    );
    const term = await service.execute(
      {
        action: "SET_PAYMENT_TERM",
        installments: 6,
        rate: "0.055",
        expectedRevision: null,
      },
      id(9)
    );
    expect(settings).toMatchObject({ minimumSellingPrice: "250.00" });
    expect(term).toMatchObject({ rate: "0.055" });
    expect(mock.rpc).toHaveBeenNthCalledWith(
      1,
      "pricing_get_policy_secure",
      { p_policy_id: id(1) }
    );
    expect(mock.rpc).toHaveBeenNthCalledWith(
      2,
      "pricing_set_product_settings_secure",
      expect.objectContaining({ p_minimum_selling_price: "250.00" })
    );
    expect(mock.rpc).toHaveBeenNthCalledWith(
      3,
      "pricing_set_payment_term_secure",
      expect.objectContaining({ p_rate: "0.055" })
    );
  });

  it("sanitizes unknown persistence failures", () => {
    expect(() =>
      mapPricingPersistenceError({
        message: "duplicate key violates secret_internal_constraint",
      })
    ).toThrowError(
      expect.objectContaining({
        status: 500,
        code: "PRICING_PERSISTENCE_ERROR",
        message: "Pricing persistence failed.",
      })
    );
  });

  it("maps stable SQL conflict sentinels without raw SQL leakage", () => {
    try {
      mapPricingPersistenceError({
        message: "PRICING_REVISION_CONFLICT details=private",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PricingPersistenceServiceError);
      expect(error).toMatchObject({
        status: 409,
        code: "PRICING_REVISION_CONFLICT",
        message: "Pricing configuration changed since it was loaded.",
      });
      expect(String((error as Error).message)).not.toContain("private");
    }
  });
});
