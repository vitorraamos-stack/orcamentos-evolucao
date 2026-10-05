import { describe, expect, it } from "vitest";
import { CostingCompatibilityError, mapRate } from "./mappers.js";

const rate = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "MATERIAL",
  materialId: "22222222-2222-4222-8222-222222222222",
  amount: "12345678901234567890.12345678901234567890",
  currency: "BRL",
  unit: "m2",
  effectiveFrom: "2026-05-01T00:00:00.000Z",
  effectiveTo: null,
};

describe("Costing persistence mapper", () => {
  it("preserves authoritative decimal text exactly", () =>
    expect(mapRate(rate).amount).toBe(rate.amount));
  it("fails closed when Postgres numeric reaches JS as number", () =>
    expect(() => mapRate({ ...rate, amount: 12.34 })).toThrow(
      CostingCompatibilityError
    ));
  it("fails closed for incompatible currency, unit, UUID, and timestamp", () => {
    for (const patch of [
      { currency: "USD" },
      { unit: "box" },
      { id: "bad" },
      { effectiveFrom: "2026-05-01" },
    ])
      expect(() => mapRate({ ...rate, ...patch })).toThrow(
        CostingCompatibilityError
      );
  });
});
