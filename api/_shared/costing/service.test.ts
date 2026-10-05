import { describe, expect, it, vi } from "vitest";
import {
  CostingService,
  CostingServiceError,
  mapCostingPersistenceError,
} from "./service.js";

describe("CostingService", () => {
  it("passes decimal text and only server-approved arguments to current-rate RPC", async () => {
    const amount = "12345678901234567890.12345678901234567890";
    const rpc = vi
      .fn()
      .mockResolvedValue({
        data: {
          rate: {
            id: "11111111-1111-4111-8111-111111111111",
            type: "MATERIAL",
            materialId: "22222222-2222-4222-8222-222222222222",
            amount,
            currency: "BRL",
            unit: "m2",
            effectiveFrom: "2026-05-01T00:00:00.000Z",
            effectiveTo: null,
          },
        },
        error: null,
      });
    await new CostingService({ rpc }).execute(
      {
        action: "SET_CURRENT_RATE",
        type: "MATERIAL",
        resourceId: "22222222-2222-4222-8222-222222222222",
        amount,
        effectiveFrom: "2026-05-01T00:00:00.000Z",
      },
      "33333333-3333-4333-8333-333333333333"
    );
    expect(rpc).toHaveBeenCalledWith("costing_set_current_rate_secure", {
      p_type: "MATERIAL",
      p_resource_id: "22222222-2222-4222-8222-222222222222",
      p_amount: amount,
      p_effective_from: "2026-05-01T00:00:00.000Z",
      p_actor_id: "33333333-3333-4333-8333-333333333333",
    });
  });
  it("maps timestamp concurrency failures to HTTP 409 semantics", () => {
    try {
      mapCostingPersistenceError({ message: "RESOURCE_CONCURRENCY_CONFLICT" });
    } catch (error) {
      expect(error).toBeInstanceOf(CostingServiceError);
      expect(error).toMatchObject({
        status: 409,
        code: "RESOURCE_CONCURRENCY_CONFLICT",
      });
    }
  });
});
