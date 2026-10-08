import { describe, expect, it, vi } from "vitest";
import {
  OfficialQuotePersistenceService,
  QuotePersistenceServiceError,
  mapQuotePersistenceError,
} from "./persistenceService";
import type { OfficialQuoteCalculationResult } from "./calculationService";
import { QuoteNegotiationServiceError } from "./negotiationService";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-07T12:00:00Z";

const calculation = (): OfficialQuoteCalculationResult =>
  ({
    publicResult: {
      calculationVersion: "1.0",
      productId: id(1),
      productVersionId: id(2),
      productVersionNumber: 2,
      productVersionRevision: 2,
      commercialQuantity: "1",
      installments: 3,
      productSellingPrice: { currency: "BRL", amount: "720" },
      installation: {
        requested: true,
        areaM2: "1",
        tier: "TIER_1",
        price: { currency: "BRL", amount: "150" },
      },
      munck: {
        requested: false,
        requestedHours: null,
        billedHours: null,
        price: { currency: "BRL", amount: "0" },
      },
      subtotalBeforeFinancialRate: { currency: "BRL", amount: "870" },
      roundingRule: "BRL_2DP_HALF_UP_V1",
      totalSellingPrice: { currency: "BRL", amount: "870.00" },
    },
    pricing: {
      publicResult: {} as any,
      costing: {
        aggregationVersion: "1.0",
        productId: id(1),
        productVersionId: id(2),
        productVersionNumber: 2,
        productVersionRevision: 2,
        effectiveCostAt: now,
        commercialQuantity: "1",
        resolvedInputs: [],
        components: [],
        unitVariableCost: { currency: "BRL", amount: "240" },
        quoteItemFixedCost: { currency: "BRL", amount: "0" },
        totalCost: { currency: "BRL", amount: "240" },
      },
      pricingEngine: {
        engineVersion: "1.0",
        schemaVersion: "1.0",
        policyId: id(3),
        policyVersionId: id(4),
        policyVersionNumber: 1,
        policyVersionRevision: 1,
        productId: id(1),
        productVersionId: id(2),
        productVersionNumber: 2,
        productVersionRevision: 2,
        costingAggregationVersion: "1.0",
        effectiveCostAt: now,
        commercialQuantity: "1",
        strategy: {
          type: "MARKUP_ON_COST",
          markup: "2",
          markupBase: "TOTAL_COST",
        },
        technicalPrecision: "DECIMAL_50_HALF_EVEN_V1",
        unroundedTotalSellingPrice: { currency: "BRL", amount: "720" },
        breakdown: {
          totalCost: { currency: "BRL", amount: "240" },
          costBasedCharges: { currency: "BRL", amount: "0" },
          sellingPriceBasedCharges: { currency: "BRL", amount: "0" },
          profitAmount: { currency: "BRL", amount: "480" },
          realizedMargin: "0.66666666666666666667",
        },
      },
      commercial: {
        roundingRule: "BRL_2DP_HALF_UP_V1",
        minimumApplied: false,
        baseSellingPrice: { currency: "BRL", amount: "720" },
        minimumSellingPrice: { currency: "BRL", amount: "700" },
        priceAfterMinimum: { currency: "BRL", amount: "720" },
        financialRate: "0",
        unroundedTotalSellingPrice: { currency: "BRL", amount: "720" },
        totalSellingPrice: { currency: "BRL", amount: "720.00" },
      },
      privateProvenance: {
        productPricingSettingsRevision: 1,
        paymentRateSource: "SYSTEM_ZERO",
        paymentTermRevision: null,
      },
    },
    installationSettingsRevision: 1,
    installationSettings: {
      tier1MaxAreaM2: "1",
      tier1Price: "150",
      tier2MaxAreaM2: "2",
      tier2Price: "180",
      tier3Price: "200",
      munckHourlyPrice: "375",
      munckMinimumHours: "4",
      revision: 1,
      updatedAt: now,
      updatedBy: id(9),
    },
  }) as OfficialQuoteCalculationResult;

const request = {
  quoteId: null,
  expectedRevision: null,
  commercial: {
    customerName: "Cliente Teste",
    customerPhone: "48999999999",
    title: "Letreiro recepção",
  },
  productVersionId: id(2),
  request: {
    commercialQuantity: "1",
    technicalInputs: {},
  },
  installments: 3,
  installation: { requested: true },
  munck: { requested: false },
};

describe("OfficialQuotePersistenceService", () => {
  it("recalculates server-side before creating an immutable snapshot", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote_id: id(10),
          quote_number: 1001,
          status: "DRAFT",
          revision: 1,
          snapshot_id: id(11),
          snapshot_version: 1,
          saved_at: now,
          customer_name: "Cliente Teste",
          customer_phone: "48999999999",
          title: "Letreiro recepção",
        },
        error: null,
      })),
    };
    const calculator = { calculate: vi.fn(async () => calculation()) };
    const result = await new OfficialQuotePersistenceService(
      db,
      calculator
    ).save(request, id(9), false);

    expect(calculator.calculate).toHaveBeenCalledWith({
      productVersionId: id(2),
      request: request.request,
      installments: 3,
      installation: { requested: true },
      munck: { requested: false },
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "quote_create_with_snapshot_v3_secure",
      expect.objectContaining({
        p_actor_id: id(9),
        p_customer_name: "Cliente Teste",
        p_customer_phone: "48999999999",
        p_title: "Letreiro recepção",
        p_commercial_snapshot: request.commercial,
        p_official_total_selling_price: "870.00",
        p_minimum_allowed_total: "850.00",
        p_total_selling_price: "870.00",
        p_negotiation_private_snapshot: expect.objectContaining({
          mode: "OFFICIAL",
          officialTotal: { currency: "BRL", amount: "870.00" },
          minimumAllowedTotal: { currency: "BRL", amount: "850.00" },
          finalTotal: { currency: "BRL", amount: "870.00" },
          adjustmentKind: "NONE",
          belowMinimum: false,
          belowMinimumOverride: false,
          reason: null,
        }),
        p_pricing_policy_id: id(3),
        p_pricing_policy_version_id: id(4),
        p_request_snapshot: expect.objectContaining({
          productVersionId: id(2),
        }),
        p_private_snapshot: expect.objectContaining({
          costing: expect.any(Object),
          pricingEngine: expect.any(Object),
          installationSettings: expect.any(Object),
        }),
      })
    );
    expect(result).toMatchObject({
      quoteId: id(10),
      quoteNumber: 1001,
      revision: 1,
      snapshotVersion: 1,
      commercial: request.commercial,
      publicResult: { totalSellingPrice: { amount: "870.00" } },
      negotiation: {
        pricingMode: "OFFICIAL",
        totalSellingPrice: { currency: "BRL", amount: "870.00" },
      },
    });
  });

  it("appends with optimistic locking for an existing DRAFT quote", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote_id: id(10),
          quote_number: 1001,
          status: "DRAFT",
          revision: 2,
          snapshot_id: id(12),
          snapshot_version: 2,
          saved_at: now,
          customer_name: "Cliente Teste",
          customer_phone: "48999999999",
          title: "Letreiro recepção",
        },
        error: null,
      })),
    };
    const service = new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    });
    db.rpc
      .mockResolvedValueOnce({
        data: {
          quote: { id: id(10), created_by: id(9) },
          snapshot: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          quote_id: id(10),
          quote_number: 1001,
          status: "DRAFT",
          revision: 2,
          snapshot_id: id(12),
          snapshot_version: 2,
          saved_at: now,
          customer_name: "Cliente Teste",
          customer_phone: "48999999999",
          title: "Letreiro recepção",
        },
        error: null,
      });

    await service.save(
      { ...request, quoteId: id(10), expectedRevision: 1 },
      id(9),
      false
    );
    expect(db.rpc).toHaveBeenNthCalledWith(
      2,
      "quote_append_snapshot_v3_secure",
      expect.objectContaining({
        p_quote_id: id(10),
        p_expected_revision: 1,
        p_actor_id: id(9),
      })
    );
  });

  it("loads only the public current snapshot contract", async () => {
    const calc = calculation();
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote: {
            id: id(10),
            quote_number: 1001,
            created_by: id(9),
            status: "DRAFT",
            revision: 2,
            customer_name: "Cliente Teste",
            customer_phone: "48999999999",
            title: "Letreiro recepção",
          },
          snapshot: {
            id: id(12),
            version_number: 2,
            created_at: now,
            request_snapshot: {
              productVersionId: id(2),
              request: request.request,
              installments: 3,
              installation: { requested: true },
              munck: { requested: false },
            },
            official_total_selling_price: "870.00",
            minimum_allowed_total: "850.00",
            negotiation_private_snapshot: {
              mode: "OFFICIAL",
              officialTotal: { currency: "BRL", amount: "870.00" },
              minimumAllowedTotal: { currency: "BRL", amount: "850.00" },
              finalTotal: { currency: "BRL", amount: "870.00" },
              adjustmentKind: "NONE",
              adjustmentAmount: { currency: "BRL", amount: "0.00" },
              belowMinimum: false,
              belowMinimumOverride: false,
              reason: null,
            },
            public_result_snapshot: calc.publicResult,
            private_snapshot: { secret: "must-not-leak" },
          },
        },
        error: null,
      })),
    };
    const result = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calc,
    }).load(
      { action: "GET_QUOTE", quoteId: id(10) },
      id(9),
      false
    );

    expect(result.publicResult.totalSellingPrice.amount).toBe("870.00");
    expect(result.negotiation).toEqual({
      pricingMode: "OFFICIAL",
      totalSellingPrice: { currency: "BRL", amount: "870.00" },
    });
    expect(result.commercial).toEqual(request.commercial);
    expect(result).not.toHaveProperty("private_snapshot");
    expect(result).not.toHaveProperty("privateSnapshot");
    expect(result).not.toHaveProperty("minimum_allowed_total");
    expect(result).not.toHaveProperty("minimumAllowedTotal");
    expect(result).not.toHaveProperty("negotiation_private_snapshot");
    expect(result).not.toHaveProperty("negotiationPrivateSnapshot");
  });

  it("persists a manager-authorized final price without exposing the protected floor", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote_id: id(10),
          quote_number: 1001,
          status: "DRAFT",
          revision: 1,
          snapshot_id: id(11),
          snapshot_version: 1,
          saved_at: now,
          customer_name: "Cliente Teste",
          customer_phone: "48999999999",
          title: "Letreiro recepção",
        },
        error: null,
      })),
    };
    const result = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    }).save(
      {
        ...request,
        negotiation: {
          mode: "MANAGER_FINAL_PRICE",
          finalAmount: "860.00",
          reason: "Condição comercial aprovada",
          allowBelowMinimum: false,
        },
      },
      id(9),
      true
    );

    expect(db.rpc).toHaveBeenCalledWith(
      "quote_create_with_snapshot_v3_secure",
      expect.objectContaining({
        p_official_total_selling_price: "870.00",
        p_minimum_allowed_total: "850.00",
        p_total_selling_price: "860.00",
        p_negotiation_private_snapshot: expect.objectContaining({
          mode: "MANAGER_FINAL_PRICE",
          reason: "Condição comercial aprovada",
          belowMinimum: false,
        }),
      })
    );
    expect(result.negotiation).toEqual({
      pricingMode: "MANAGER_ADJUSTED",
      totalSellingPrice: { currency: "BRL", amount: "860.00" },
    });
    expect(JSON.stringify(result)).not.toContain("850.00");
    expect(JSON.stringify(result)).not.toContain("Condição comercial aprovada");
  });

  it("rejects manager pricing input from consultants before the RPC", async () => {
    const db = { rpc: vi.fn() };
    const service = new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    });

    let captured: unknown;
    try {
      await service.save(
        {
          ...request,
          negotiation: {
            mode: "MANAGER_FINAL_PRICE",
            finalAmount: "860.00",
            reason: "Tentativa sem autoridade",
            allowBelowMinimum: false,
          },
        },
        id(9),
        false
      );
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(QuoteNegotiationServiceError);
    expect((captured as QuoteNegotiationServiceError).code).toBe(
      "QUOTE_NEGOTIATION_FORBIDDEN"
    );
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("keeps legacy v2 snapshots readable as OFFICIAL pricing", async () => {
    const calc = calculation();
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote: {
            id: id(10),
            quote_number: 1001,
            created_by: id(9),
            status: "DRAFT",
            revision: 1,
            customer_name: "Cliente Teste",
            customer_phone: null,
            title: "Legado",
          },
          snapshot: {
            id: id(11),
            version_number: 1,
            created_at: now,
            request_snapshot: {
              productVersionId: id(2),
              request: request.request,
              installments: 3,
              installation: { requested: true },
              munck: { requested: false },
            },
            total_selling_price: "870.00",
            negotiation_private_snapshot: null,
            public_result_snapshot: calc.publicResult,
          },
        },
        error: null,
      })),
    };

    const result = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calc,
    }).load(
      { action: "GET_QUOTE", quoteId: id(10) },
      id(9),
      false
    );

    expect(result.negotiation).toEqual({
      pricingMode: "OFFICIAL",
      totalSellingPrice: { currency: "BRL", amount: "870.00" },
    });
  });

  it("rejects malformed v3 negotiation evidence instead of downgrading it to legacy", async () => {
    const calc = calculation();
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote: {
            id: id(10),
            quote_number: 1001,
            created_by: id(9),
            status: "DRAFT",
            revision: 1,
            customer_name: "Cliente Teste",
            customer_phone: null,
            title: "Snapshot inválido",
          },
          snapshot: {
            id: id(11),
            version_number: 1,
            created_at: now,
            request_snapshot: {
              productVersionId: id(2),
              request: request.request,
              installments: 3,
              installation: { requested: true },
              munck: { requested: false },
            },
            total_selling_price: "860.00",
            negotiation_private_snapshot: { mode: "BROKEN" },
            public_result_snapshot: calc.publicResult,
          },
        },
        error: null,
      })),
    };

    let captured: unknown;
    try {
      await new OfficialQuotePersistenceService(db, {
        calculate: async () => calc,
      }).load(
        { action: "GET_QUOTE", quoteId: id(10) },
        id(9),
        false
      );
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(QuotePersistenceServiceError);
    expect((captured as QuotePersistenceServiceError).code).toBe(
      "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR"
    );
  });

  it("loads sanitized commercial metrics scoped by actor context", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          total_quotes: 10,
          draft_quotes: 2,
          sent_quotes: 2,
          open_quotes: 4,
          accepted_quotes: 3,
          rejected_quotes: 2,
          cancelled_quotes: 1,
          decided_quotes: 5,
          conversion_bps: 6000,
          accepted_value: "4350.00",
          rejected_without_reason: 1,
          loss_reasons: [
            { code: "PRICE", count: 1 },
          ],
        },
        error: null,
      })),
    };

    const metrics = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    }).metrics(
      { action: "GET_QUOTE_METRICS" },
      id(9),
      false
    );

    expect(db.rpc).toHaveBeenCalledWith(
      "quote_commercial_metrics_secure",
      {
        p_actor_id: id(9),
        p_is_manager: false,
      }
    );
    expect(metrics).toMatchObject({
      totalQuotes: 10,
      openQuotes: 4,
      acceptedQuotes: 3,
      rejectedQuotes: 2,
      cancelledQuotes: 1,
      decidedQuotes: 5,
      conversionBps: 6000,
      acceptedValue: { currency: "BRL", amount: "4350.00" },
      rejectedWithoutReason: 1,
      lossReasons: [{ code: "PRICE", count: 1 }],
    });
    expect(JSON.stringify(metrics)).not.toContain("customer");
    expect(JSON.stringify(metrics)).not.toContain("reason_note");
    expect(JSON.stringify(metrics)).not.toContain("payload");
  });

  it("rejects inconsistent persisted commercial metrics", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          total_quotes: 10,
          draft_quotes: 2,
          sent_quotes: 2,
          open_quotes: 99,
          accepted_quotes: 3,
          rejected_quotes: 2,
          cancelled_quotes: 1,
          decided_quotes: 5,
          conversion_bps: 6000,
          accepted_value: "4350.00",
          rejected_without_reason: 0,
          loss_reasons: [],
        },
        error: null,
      })),
    };

    await expect(
      new OfficialQuotePersistenceService(db, {
        calculate: async () => calculation(),
      }).metrics(
        { action: "GET_QUOTE_METRICS" },
        id(9),
        true
      )
    ).rejects.toMatchObject({
      code: "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR",
      status: 500,
    });
  });

  it("loads sanitized Quote history without private event payloads", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          items: [
            {
              event_id: id(30),
              event_type: "SNAPSHOT_APPENDED",
              occurred_at: now,
              actor_id: id(9),
              actor_email: "gestor@evolucao.test",
              snapshot_version: 2,
              pricing_mode: "MANAGER_ADJUSTED",
              total_selling_price: "860.00",
              from_status: null,
              to_status: null,
            },
            {
              event_id: id(31),
              event_type: "STATUS_CHANGED",
              occurred_at: now,
              actor_id: id(9),
              actor_email: "gestor@evolucao.test",
              snapshot_version: 2,
              pricing_mode: "MANAGER_ADJUSTED",
              total_selling_price: "860.00",
              from_status: "DRAFT",
              to_status: "SENT",
            },
          ],
        },
        error: null,
      })),
    };
    const service = new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    });

    const history = await service.history(
      { action: "GET_QUOTE_HISTORY", quoteId: id(10) },
      id(9),
      true
    );

    expect(db.rpc).toHaveBeenCalledWith("quote_history_secure", {
      p_quote_id: id(10),
      p_actor_id: id(9),
      p_is_manager: true,
    });
    expect(history.items).toHaveLength(2);
    expect(history.items[0]).toMatchObject({
      eventType: "SNAPSHOT_APPENDED",
      snapshotVersion: 2,
      pricingMode: "MANAGER_ADJUSTED",
      totalSellingPrice: { currency: "BRL", amount: "860.00" },
    });
    expect(history.items[1]).toMatchObject({
      eventType: "STATUS_CHANGED",
      fromStatus: "DRAFT",
      toStatus: "SENT",
    });
    expect(JSON.stringify(history)).not.toContain("minimumAllowedTotal");
    expect(JSON.stringify(history)).not.toContain("negotiation_private_snapshot");
    expect(JSON.stringify(history)).not.toContain("payload");
  });

  it("maps Quote history ownership denial to a safe 403", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "QUOTE_FORBIDDEN" },
      })),
    };
    await expect(
      new OfficialQuotePersistenceService(db, {
        calculate: async () => calculation(),
      }).history(
        { action: "GET_QUOTE_HISTORY", quoteId: id(10) },
        id(9),
        false
      )
    ).rejects.toMatchObject({
      status: 403,
      code: "QUOTE_FORBIDDEN",
    });
  });

  it("transitions status using the authenticated actor and expected revision", async () => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            quote: { id: id(10), created_by: id(9) },
            snapshot: {},
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            quote_id: id(10),
            quote_number: 1001,
            status: "SENT",
            revision: 3,
            snapshot_id: id(12),
            updated_at: now,
          },
          error: null,
        }),
    };
    const result = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    }).transition(
      {
        action: "TRANSITION_QUOTE",
        quoteId: id(10),
        expectedRevision: 2,
        targetStatus: "SENT",
      },
      id(9),
      false
    );
    expect(db.rpc).toHaveBeenNthCalledWith(
      2,
      "quote_transition_status_v2_secure",
      {
        p_quote_id: id(10),
        p_expected_revision: 2,
        p_target_status: "SENT",
        p_actor_id: id(9),
        p_is_manager: false,
        p_reason_code: null,
        p_reason_note: null,
      }
    );
    expect(result.status).toBe("SENT");
  });

  it("passes a structured rejected outcome only to transition v2", async () => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            quote: { id: id(10), created_by: id(9) },
            snapshot: {},
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            quote_id: id(10),
            quote_number: 1001,
            status: "REJECTED",
            revision: 3,
            snapshot_id: id(12),
            updated_at: now,
          },
          error: null,
        }),
    };

    await new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    }).transition(
      {
        action: "TRANSITION_QUOTE",
        quoteId: id(10),
        expectedRevision: 2,
        targetStatus: "REJECTED",
        outcomeReason: {
          code: "PRICE",
          note: "Cliente recebeu proposta mais barata.",
        },
      },
      id(9),
      false
    );

    expect(db.rpc).toHaveBeenNthCalledWith(
      2,
      "quote_transition_status_v2_secure",
      expect.objectContaining({
        p_is_manager: false,
        p_reason_code: "PRICE",
        p_reason_note: "Cliente recebeu proposta mais barata.",
      })
    );
  });

  it("loads sanitized outcome reasons without exposing raw event payloads", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          items: [
            {
              event_id: id(31),
              event_type: "STATUS_CHANGED",
              occurred_at: now,
              actor_id: id(9),
              actor_email: "consultor@evolucao.test",
              snapshot_version: 2,
              pricing_mode: "OFFICIAL",
              total_selling_price: "870.00",
              from_status: "SENT",
              to_status: "REJECTED",
              outcome_reason_code: "PRICE",
              outcome_reason_note: "Cliente recebeu proposta mais barata.",
            },
          ],
        },
        error: null,
      })),
    };

    const history = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    }).history(
      { action: "GET_QUOTE_HISTORY", quoteId: id(10) },
      id(9),
      false
    );

    expect(history.items[0]).toMatchObject({
      toStatus: "REJECTED",
      outcomeReason: {
        code: "PRICE",
        note: "Cliente recebeu proposta mais barata.",
      },
    });
    expect(JSON.stringify(history)).not.toContain("payload");
  });

  it("blocks consultants from reading another consultant's Quote", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote: { id: id(10), created_by: id(8) },
          snapshot: {},
        },
        error: null,
      })),
    };
    await expect(
      new OfficialQuotePersistenceService(db, {
        calculate: async () => calculation(),
      }).load(
        { action: "GET_QUOTE", quoteId: id(10) },
        id(9),
        false
      )
    ).rejects.toMatchObject({
      status: 403,
      code: "QUOTE_FORBIDDEN",
    });
  });

  it("allows managers to read another consultant's Quote", async () => {
    const calc = calculation();
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote: {
            id: id(10),
            quote_number: 1001,
            status: "DRAFT",
            revision: 1,
            created_by: id(8),
            customer_name: "Outro cliente",
            customer_phone: null,
            title: "Fachada",
          },
          snapshot: {
            id: id(11),
            version_number: 1,
            created_at: now,
            request_snapshot: {
              productVersionId: id(2),
              request: request.request,
              installments: 3,
              installation: { requested: true },
              munck: { requested: false },
            },
            public_result_snapshot: calc.publicResult,
          },
        },
        error: null,
      })),
    };
    const loaded = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calc,
    }).load(
      { action: "GET_QUOTE", quoteId: id(10) },
      id(9),
      true
    );
    expect(loaded.quoteId).toBe(id(10));
  });

  it("lists only the sanitized current Quote summaries", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          total: 1,
          items: [
            {
              quote_id: id(10),
              quote_number: 1001,
              status: "DRAFT",
              revision: 2,
              customer_name: "Cliente Teste",
              customer_phone: "48999999999",
              title: "Letreiro recepção",
              snapshot_version: 2,
              pricing_mode: "MANAGER_ADJUSTED",
              total_selling_price: "860.00",
              installments: 3,
              product_id: id(1),
              product_name: "Letreiro em PVC",
              created_at: now,
              updated_at: now,
              created_by: id(9),
              created_by_email: "consultor@evolucao.test",
            },
          ],
        },
        error: null,
      })),
    };
    const service = new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    });

    const listed = await service.list(
      {
        action: "LIST_QUOTES",
        page: 1,
        pageSize: 25,
        search: "Cliente",
        status: "DRAFT",
      },
      id(9),
      false
    );

    expect(db.rpc).toHaveBeenCalledWith("quote_list_secure", {
      p_actor_id: id(9),
      p_is_manager: false,
      p_search: "Cliente",
      p_status: "DRAFT",
      p_limit: 25,
      p_offset: 0,
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0]).toMatchObject({
      quoteNumber: 1001,
      commercial: request.commercial,
      productName: "Letreiro em PVC",
      pricingMode: "MANAGER_ADJUSTED",
      totalSellingPrice: { currency: "BRL", amount: "860.00" },
    });
    expect(listed.items[0]).not.toHaveProperty("costing");
    expect(listed.items[0]).not.toHaveProperty("privateSnapshot");
    expect(listed.items[0]).not.toHaveProperty("minimumAllowedTotal");
    expect(listed.items[0]).not.toHaveProperty("negotiationPrivateSnapshot");
  });

  it("treats legacy list rows without pricing_mode as OFFICIAL", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          total: 1,
          items: [
            {
              quote_id: id(10),
              quote_number: 1001,
              status: "DRAFT",
              revision: 1,
              customer_name: "Cliente legado",
              customer_phone: null,
              title: "Orçamento legado",
              snapshot_version: 1,
              total_selling_price: "870.00",
              installments: 3,
              product_id: id(1),
              product_name: "Letreiro em PVC",
              created_at: now,
              updated_at: now,
              created_by: id(9),
              created_by_email: null,
            },
          ],
        },
        error: null,
      })),
    };

    const listed = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    }).list(
      {
        action: "LIST_QUOTES",
        page: 1,
        pageSize: 25,
        search: null,
        status: null,
      },
      id(9),
      false
    );

    expect(listed.items[0].pricingMode).toBe("OFFICIAL");
  });

  it("rejects invalid sanitized pricing_mode values from the list RPC", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          total: 1,
          items: [
            {
              quote_id: id(10),
              quote_number: 1001,
              status: "DRAFT",
              revision: 1,
              customer_name: "Cliente",
              customer_phone: null,
              title: "Inválido",
              snapshot_version: 1,
              pricing_mode: "PRIVATE_BROKEN_MODE",
              total_selling_price: "870.00",
              installments: 3,
              product_id: id(1),
              product_name: "Letreiro em PVC",
              created_at: now,
              updated_at: now,
              created_by: id(9),
              created_by_email: null,
            },
          ],
        },
        error: null,
      })),
    };

    await expect(
      new OfficialQuotePersistenceService(db, {
        calculate: async () => calculation(),
      }).list(
        {
          action: "LIST_QUOTES",
          page: 1,
          pageSize: 25,
          search: null,
          status: null,
        },
        id(9),
        false
      )
    ).rejects.toMatchObject({
      code: "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR",
      status: 500,
    });
  });

  it("sanitizes SQL persistence errors", () => {
    expect(() =>
      mapQuotePersistenceError({
        message: "duplicate secret constraint internal_details",
      })
    ).toThrowError(
      expect.objectContaining({
        code: "QUOTE_PERSISTENCE_ERROR",
        message: "Quote persistence failed.",
      })
    );
  });

  it("maps stable quote conflict sentinels", () => {
    expect(() =>
      mapQuotePersistenceError({
        message: "QUOTE_REVISION_CONFLICT private details",
      })
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        code: "QUOTE_REVISION_CONFLICT",
        message: "Quote changed since it was loaded.",
      })
    );
  });

  it("rejects an existing quote without expectedRevision before calculation", async () => {
    const calculator = { calculate: vi.fn(async () => calculation()) };
    await expect(
      new OfficialQuotePersistenceService(
        { rpc: vi.fn() },
        calculator
      ).save(
        { ...request, quoteId: id(10), expectedRevision: null },
        id(9)
      )
    ).rejects.toBeInstanceOf(QuotePersistenceServiceError);
    expect(calculator.calculate).not.toHaveBeenCalled();
  });
});
